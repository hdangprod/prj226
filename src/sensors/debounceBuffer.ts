/**
 * PRJ226 v3.0: Debounce Buffer — Cloudflare Durable Object
 *
 * Replaces: Upstash Redis (RPUSH/EXPIRE) + QStash (delayed execution)
 * Pattern:  Message accumulation with 4s TTL flush → Cloudflare Queue
 *
 * Durable Object lifecycle:
 *   POST /ingest      → Accumulate message, (re)schedule alarm for flush
 *   Alarm fires       → Flush all buffered messages as single merged payload
 *
 * Guarantees:
 *   - Max 15 messages per buffer (spam protection)
 *   - 30s state TTL to prevent memory leak
 *   - Fail-open: if DO state is corrupted, clears and continues
 */

import type { Env } from '../config';
import { getDebounceConfig } from '../config';

// ─── Durable Object ──────────────────────────────────────────────────────────

export class DebounceBuffer {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ingest' && request.method === 'POST') {
      return this.handleIngest(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  /** Alarm fires after bufferTimeMs of inactivity → flush to queue */
  async alarm(): Promise<void> {
    await this.flush();
  }

  // ─── Ingest ────────────────────────────────────────────────────────────────

  private async handleIngest(request: Request): Promise<Response> {
    const config = getDebounceConfig(this.env);

    try {
      const update = await request.json();

      // Load current buffer
      let buffer: unknown[] = (await this.state.storage.get<unknown[]>('buffer')) ?? [];

      // Spam protection: cap at MAX_BUFFER_SIZE
      if (buffer.length >= config.maxBufferSize) {
        console.warn(`[DebounceBuffer] Buffer full (${buffer.length} msgs). Dropping oldest.`);
        buffer = buffer.slice(-config.maxBufferSize + 1);
      }

      buffer.push(update);
      await this.state.storage.put('buffer', buffer);
      await this.state.storage.setAlarm(Date.now() + config.bufferTimeMs);

      console.log(`[DebounceBuffer] Buffered. Total: ${buffer.length} messages.`);
      return new Response(JSON.stringify({ status: 'buffered', count: buffer.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[DebounceBuffer] Ingest error. Clearing state:', err);
      await this.state.storage.deleteAll();
      return new Response('Internal Error', { status: 500 });
    }
  }

  // ─── Flush ─────────────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    try {
      const buffer = await this.state.storage.get<unknown[]>('buffer') ?? [];

      if (buffer.length === 0) {
        console.log('[DebounceBuffer] Alarm fired but buffer is empty. No-op.');
        return;
      }

      console.log(`[DebounceBuffer] Flushing ${buffer.length} buffered messages.`);

      // Merge all buffered messages: use last update as base, combine text
      const merged = mergeUpdates(buffer as Record<string, unknown>[]);

      // Send merged payload to Cloudflare Queue for AI processing
      await this.env.TASK_QUEUE.send(merged);
      console.log('[DebounceBuffer] Flushed merged payload to TASK_QUEUE.');
    } catch (err) {
      console.error('[DebounceBuffer] Flush error:', err);
    } finally {
      // Always clear buffer and cancel alarm after flush attempt
      await this.state.storage.deleteAll();
    }
  }
}

// ─── Merge Strategy ──────────────────────────────────────────────────────────

function mergeUpdates(updates: Record<string, unknown>[]): Record<string, unknown> {
  if (updates.length === 1) return updates[0];

  // Use the last update as the structural base
  const base = { ...(updates[updates.length - 1] as Record<string, unknown>) };

  // Concatenate all text messages with newlines
  const texts = updates
    .map((u) => {
      const msg = u.message as { text?: string } | undefined;
      return msg?.text;
    })
    .filter((t): t is string => Boolean(t));

  if (texts.length > 1 && base.message) {
    (base.message as Record<string, unknown>).text = texts.join('\n');
  }

  return base;
}
