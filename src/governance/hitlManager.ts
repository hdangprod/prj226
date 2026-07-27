/**
 * PRJ226 v3.0: HITL Manager (Cloudflare KV Backed — 100% Free Tier)
 *
 * Manages Human-In-The-Loop session state for multi-turn interactions.
 * Replaces: Durable Objects & Firestore
 * Uses: Cloudflare KV (SESSION_KV binding) with 300s expiration TTL
 */

import type { Env } from '../config';
import type { Intent } from './intentRouter';

export interface HITLState {
  pendingIntent: Intent;
  pendingPayload: Record<string, unknown>;
  userText: string;
  expiresAt: number;
}

export class HITLManager {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private getKey(chatId: number): string {
    return `hitl:${chatId}`;
  }

  async saveSession(chatId: number, state: Omit<HITLState, 'expiresAt'>): Promise<void> {
    const key = this.getKey(chatId);
    const sessionData: HITLState = {
      ...state,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    await this.env.SESSION_KV.put(key, JSON.stringify(sessionData), {
      expirationTtl: 300, // 5 minutes TTL in KV
    });
  }

  async getSession(chatId: number): Promise<HITLState | null> {
    const key = this.getKey(chatId);
    const raw = await this.env.SESSION_KV.get(key);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw) as HITLState;
      if (Date.now() > session.expiresAt) {
        await this.clearSession(chatId);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async clearSession(chatId: number): Promise<void> {
    const key = this.getKey(chatId);
    await this.env.SESSION_KV.delete(key);
  }
}
