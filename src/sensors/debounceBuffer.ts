/**
 * PRJ226 v3.0: Debounce Buffer (Cloudflare KV Backed — 100% Free Tier)
 *
 * Replaces: Durable Objects & Upstash Redis
 * Pattern:  KV key accumulation with sliding window TTL
 *
 * Features:
 *   - 100% Free Tier (Cloudflare KV: 100k reads/day, 1k writes/day)
 *   - Fast-path execution using Cloudflare Worker ctx.waitUntil()
 */

import type { Env } from '../config';
import { getDebounceConfig } from '../config';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

export class DebounceManager {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /** Buffer incoming message or merge with existing pending buffer in KV */
  async bufferMessage(chatId: number, update: Record<string, unknown>): Promise<{ shouldProcess: boolean; mergedPayload: Record<string, unknown> }> {
    const config = getDebounceConfig(this.env);
    if (!config.enabled) {
      return { shouldProcess: true, mergedPayload: update };
    }

    const key = `debounce:${chatId}`;
    try {
      const existingRaw = await this.env.SESSION_KV.get(key);
      let buffer: Record<string, unknown>[] = existingRaw ? JSON.parse(existingRaw) : [];

      if (buffer.length >= config.maxBufferSize) {
        buffer = buffer.slice(-config.maxBufferSize + 1);
      }

      buffer.push(update);

      // Merge all buffered updates
      const mergedPayload = mergeUpdates(buffer);

      // Write updated buffer to KV with short TTL (60s)
      await this.env.SESSION_KV.put(key, JSON.stringify(buffer), { expirationTtl: 60 });

      return { shouldProcess: true, mergedPayload };
    } catch (err) {
      console.warn('[DebounceManager] KV error, failing open to direct processing:', err);
      return { shouldProcess: true, mergedPayload: update };
    }
  }

  /** Clear buffer state for a chat after processing */
  async clearBuffer(chatId: number): Promise<void> {
    try {
      await this.env.SESSION_KV.delete(`debounce:${chatId}`);
    } catch (err) {
      console.warn('[DebounceManager] Clear buffer failed:', err);
    }
  }
}

function mergeUpdates(updates: Record<string, unknown>[]): Record<string, unknown> {
  if (updates.length === 1) return updates[0];
  const base = { ...(updates[updates.length - 1] as Record<string, unknown>) };
  const texts = updates
    .map((u) => (u.message as { text?: string } | undefined)?.text)
    .filter((t): t is string => Boolean(t));

  if (texts.length > 1 && base.message) {
    (base.message as Record<string, unknown>).text = texts.join('\n');
  }

  return base;
}
