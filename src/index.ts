/**
 * PRJ226 v3.0: Cloudflare Workers Entry Point (Hono)
 *
 * Routes:
 *   POST /webhook          → Telegram update receiver (< 50ms typing ack)
 *   POST /worker           → Internal queue consumer (AI processing)
 *   POST /notion-sync      → Notion Fast-Sync webhook (if on Notion Enterprise)
 *   GET  /health           → Health check
 *   GET  /scheduled        → Triggered by Cloudflare Cron (notion polling)
 */

import { Hono } from 'hono';
import type { Env } from './config';
import { handleTelegramWebhook } from './sensors/telegramWebhook';
import { handleWorkerPayload } from './governance/intentRouter';
import { handleNotionSync } from './sensors/notionFastSync';
import { DebounceBuffer } from './sensors/debounceBuffer';
import { HitlSession } from './governance/hitlManager';
import { NeonClient } from './tools/neonClient';

// Re-export Durable Object classes (required by Cloudflare Workers)
export { DebounceBuffer, HitlSession };

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware: Bot protection ────────────────────────────────────────────────
app.use('/webhook', async (c, next) => {
  const body = await c.req.json().catch(() => null);
  if (body?.message?.from?.is_bot === true) {
    console.log('[Webhook] Bot protection: dropped update from bot user.');
    return c.text('OK', 200);
  }
  // Attach parsed body for downstream handlers
  c.set('body' as never, body);
  return next();
});

// ─── Telegram Webhook ─────────────────────────────────────────────────────────
app.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const body = await c.req.json();
  // Fire-and-forget: typing ack + async processing
  await handleTelegramWebhook(body, c.env);
  return c.text('OK', 200);
});

// ─── Internal Queue Consumer (AI processing) ──────────────────────────────────
app.post('/worker', async (c) => {
  const body = await c.req.json();
  await handleWorkerPayload(body, c.env);
  return c.text('OK', 200);
});

// ─── Notion Fast-Sync Webhook ─────────────────────────────────────────────────
app.post('/notion-sync', async (c) => {
  const body = await c.req.json();
  await handleNotionSync(body, c.env);
  return c.text('OK', 200);
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (c) => {
  const neon = new NeonClient(c.env);
  const dbOk = await neon.ping();
  return c.json({ status: 'ok', db: dbOk ? 'connected' : 'unreachable', version: '3.0.0' });
});

// ─── Cloudflare Worker Default Export ────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  /**
   * Cron Trigger: Notion Fast-Sync polling (runs every 1 minute via wrangler.toml)
   * Cloudflare Cron minimum interval is 1 minute, not 30 seconds.
   */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[Cron] Notion Fast-Sync triggered.');
    await handleNotionSync({ type: 'cron' }, env);
  },

  /**
   * Cloudflare Queue Consumer: processes debounced payloads
   */
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleWorkerPayload(message.body as Record<string, unknown>, env);
        message.ack();
      } catch (err) {
        console.error('[Queue] Failed to process message:', err);
        message.retry();
      }
    }
  },
};
