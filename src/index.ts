/**
 * PRJ226 v3.0: Cloudflare Workers Entry Point (Hono — 100% Free Tier)
 *
 * Routes:
 *   POST /webhook          → Telegram update receiver (< 50ms typing ack + ctx.waitUntil)
 *   POST /worker           → Async processing endpoint
 *   GET  /health           → Health check
 */

import { Hono } from 'hono';
import type { Env } from './config';
import { handleTelegramWebhook } from './sensors/telegramWebhook';
import { handleWorkerPayload } from './governance/intentRouter';
import { NeonClient } from './tools/neonClient';

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware: Bot protection ────────────────────────────────────────────────
app.use('/webhook', async (c, next) => {
  const body = await c.req.json().catch(() => null);
  if (body?.message?.from?.is_bot === true) {
    console.log('[Webhook] Bot protection: dropped update from bot user.');
    return c.text('OK', 200);
  }
  return next();
});

// ─── Telegram Webhook ─────────────────────────────────────────────────────────
app.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const body = await c.req.json();
  // Dispatch non-blocking processing via executionContext
  await handleTelegramWebhook(body, c.env, c.executionCtx as any);
  return c.text('OK', 200);
});

// ─── Internal Task Consumer ──────────────────────────────────────────────────
app.post('/worker', async (c) => {
  const body = await c.req.json();
  await handleWorkerPayload(body, c.env);
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
};
