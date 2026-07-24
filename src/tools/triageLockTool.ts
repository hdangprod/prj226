import { TRIAGE_CONFIG } from '../config';

interface LockRecord {
  value: string;
  expiresAt: number;
}

class TriageLockTool {
  private hardLocks = new Map<string, LockRecord>();
  private softLocks = new Map<string, LockRecord>();
  private distributedLocks = new Map<string, LockRecord>();
  private turnCounters = new Map<string, { count: number; expiresAt: number }>();

  private cleanExpired() {
    const now = Date.now();
    for (const [key, record] of this.hardLocks.entries()) {
      if (now > record.expiresAt) this.hardLocks.delete(key);
    }
    for (const [key, record] of this.softLocks.entries()) {
      if (now > record.expiresAt) this.softLocks.delete(key);
    }
    for (const [key, record] of this.distributedLocks.entries()) {
      if (now > record.expiresAt) this.distributedLocks.delete(key);
    }
    for (const [key, record] of this.turnCounters.entries()) {
      if (now > record.expiresAt) this.turnCounters.delete(key);
    }
  }

  // --- Hard Lock ---
  public setHardLock(chatId: string | number, messageId: string | number, notionPageId: string, ttlSeconds = TRIAGE_CONFIG.REDIS_TTL_HARD_LOCK): void {
    this.cleanExpired();
    const key = `triage_map:${chatId}:${messageId}`;
    this.hardLocks.set(key, {
      value: notionPageId,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public getHardLock(chatId: string | number, messageId: string | number): string | null {
    this.cleanExpired();
    const key = `triage_map:${chatId}:${messageId}`;
    const record = this.hardLocks.get(key);
    if (!record || Date.now() > record.expiresAt) {
      this.hardLocks.delete(key);
      return null;
    }
    return record.value;
  }

  // --- Soft Lock ---
  public setSoftLock(chatId: string | number, notionPageId: string, ttlSeconds = TRIAGE_CONFIG.REDIS_TTL_SOFT_LOCK): void {
    this.cleanExpired();
    const key = `active_triage_session:${chatId}`;
    this.softLocks.set(key, {
      value: notionPageId,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public getSoftLock(chatId: string | number): string | null {
    this.cleanExpired();
    const key = `active_triage_session:${chatId}`;
    const record = this.softLocks.get(key);
    if (!record || Date.now() > record.expiresAt) {
      this.softLocks.delete(key);
      return null;
    }
    return record.value;
  }

  public deleteSoftLock(chatId: string | number): void {
    const key = `active_triage_session:${chatId}`;
    this.softLocks.delete(key);
    this.turnCounters.delete(`triage_turns:${chatId}`);
  }

  // --- Distributed Lock (SETNX) ---
  public acquireDistributedLock(notionPageId: string, ttlSeconds = 10): boolean {
    this.cleanExpired();
    const key = `lock:notion_page:${notionPageId}`;
    const now = Date.now();
    const existing = this.distributedLocks.get(key);
    if (existing && now <= existing.expiresAt) {
      return false; // Lock already held
    }
    this.distributedLocks.set(key, {
      value: '1',
      expiresAt: now + ttlSeconds * 1000,
    });
    return true;
  }

  public releaseDistributedLock(notionPageId: string): void {
    const key = `lock:notion_page:${notionPageId}`;
    this.distributedLocks.delete(key);
  }

  // --- Turn Counter ---
  public incrementTurn(chatId: string | number, ttlSeconds = TRIAGE_CONFIG.REDIS_TTL_SOFT_LOCK): number {
    this.cleanExpired();
    const key = `triage_turns:${chatId}`;
    const now = Date.now();
    const current = this.turnCounters.get(key);
    let count = 1;
    if (current && now <= current.expiresAt) {
      count = current.count + 1;
    }
    this.turnCounters.set(key, {
      count,
      expiresAt: now + ttlSeconds * 1000,
    });
    return count;
  }

  public clearAll(): void {
    this.hardLocks.clear();
    this.softLocks.clear();
    this.distributedLocks.clear();
    this.turnCounters.clear();
  }
}

export const triageLockTool = new TriageLockTool();
