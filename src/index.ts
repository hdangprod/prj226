import { Hono } from 'hono';
import type { Env } from './config';
import { handleTelegramWebhook } from './sensors/telegramWebhook';
import { handleWorkerPayload } from './governance/intentRouter';
import { handleGitHubPushWebhook } from './indexers/vaultIndexer';
import { D1Client } from './tools/d1Client';
import { batchCommitCaptures } from './tools/gitBatchClient';

import { reconcileVaultIndexCron } from './indexers/reconciler';

// Session-Based Workflow (v4.2) Durable Object — wired lazily behind
// SESSION_FEATURE_ENABLED; exporting the class makes the binding resolvable
// without changing current behavior.
export { TelegramSession } from './session/TelegramSession';

const app = new Hono<{ Bindings: Env }>();

// Bot protection middleware
app.use('/webhook', async (c, next) => {
  const body = await c.req.json().catch(() => null);
  if (body?.message?.from?.is_bot === true) {
    console.log('[Webhook] Bot protection: dropped update from bot user.');
    return c.text('OK', 200);
  }
  return next();
});

// Telegram Webhook
app.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }
  const body = await c.req.json();
  await handleTelegramWebhook(body, c.env, c.executionCtx as any);
  return c.text('OK', 200);
});

// GitHub Push Webhook
app.post('/github-webhook', async (c) => {
  return handleGitHubPushWebhook(c.req.raw, c.env);
});

// Internal Worker endpoint
app.post('/worker', async (c) => {
  const body = await c.req.json();
  await handleWorkerPayload(body, c.env);
  return c.text('OK', 200);
});

// Health Check
app.get('/health', async (c) => {
  const d1 = new D1Client(c.env);
  const dbOk = await d1.ping();
  return c.json({ status: 'ok', db: dbOk ? 'connected' : 'unreachable', version: '4.1.1' });
});

// Cloudflare Worker exports
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  // Cron Trigger: flush pending_captures & reconcile vault index periodically
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const d1 = new D1Client(env);
    
    // 1. Flush pending captures to GitHub
    const captures = await d1.getPendingCaptures(50);
    if (captures.length > 0) {
      try {
        await batchCommitCaptures(captures, env);
        await d1.markCapturesFlushed(captures.map(c => c.id));
        console.log(JSON.stringify({
          event: 'cron_flush_success',
          captures_flushed: captures.length,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        console.error(JSON.stringify({
          event: 'cron_flush_error',
          error: (err as Error).message,
          captures_pending: captures.length,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    // 2. Reconcile vault index to fix dropped webhooks
    ctx.waitUntil(
      reconcileVaultIndexCron(env)
        .then((res) => console.log(JSON.stringify({ event: 'reconcile_cron_success', ...res })))
        .catch((err) => console.error(JSON.stringify({ event: 'reconcile_cron_error', error: String(err) })))
    );
  },
};
