/**
 * PRJ226 v3.0: HITL Manager — Cloudflare Durable Object
 *
 * Manages Human-In-The-Loop session state for multi-turn interactions.
 * Replaces: Firestore TTL session state
 * Uses: Cloudflare Durable Object (HITL_SESSION binding)
 *
 * State stored per chatId:
 *   - pendingIntent: the intent waiting for user confirmation
 *   - pendingPayload: the extracted data for that intent
 *   - expiresAt: TTL timestamp (5 minutes)
 */

import type { Env } from '../config';
import type { Intent } from './intentRouter';

// ─── Durable Object ────────────────────────────────────────────────────────────

interface HITLState {
  pendingIntent: Intent;
  pendingPayload: Record<string, unknown>;
  userText: string;
  expiresAt: number;
}

export class HitlSession {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'PUT' && url.pathname === '/set') {
      const body = (await request.json()) as HITLState;
      await this.state.storage.put('session', body);
      // Set alarm for TTL cleanup (5 minutes)
      await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
      return new Response('OK', { status: 200 });
    }

    if (request.method === 'GET' && url.pathname === '/get') {
      const session = await this.state.storage.get<HITLState>('session');
      if (!session || Date.now() > session.expiresAt) {
        await this.state.storage.delete('session');
        return new Response(JSON.stringify(null), { status: 200 });
      }
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'DELETE' && url.pathname === '/clear') {
      await this.state.storage.delete('session');
      return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm(): Promise<void> {
    // TTL expired: clear session state
    await this.state.storage.deleteAll();
    console.log('[HitlSession] TTL expired. Session cleared.');
  }
}

// ─── HITL Manager API ───────────────────────────────────────────────────────────

export class HITLManager {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private getStub(chatId: number): DurableObjectStub {
    const id = this.env.HITL_SESSION.idFromName(chatId.toString());
    return this.env.HITL_SESSION.get(id);
  }

  async saveSession(chatId: number, state: Omit<HITLState, 'expiresAt'>): Promise<void> {
    const stub = this.getStub(chatId);
    await stub.fetch('https://internal/set', {
      method: 'PUT',
      body: JSON.stringify({ ...state, expiresAt: Date.now() + 5 * 60 * 1000 }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getSession(chatId: number): Promise<HITLState | null> {
    const stub = this.getStub(chatId);
    const response = await stub.fetch('https://internal/get');
    return response.json<HITLState | null>();
  }

  async clearSession(chatId: number): Promise<void> {
    const stub = this.getStub(chatId);
    await stub.fetch('https://internal/clear', { method: 'DELETE' });
  }
}
