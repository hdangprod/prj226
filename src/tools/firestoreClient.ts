import { Firestore } from '@google-cloud/firestore';
import type { TaskInput } from '../types/notion';
import type { WeeklyTaskV2 } from '../types/notion';

// In WeeklyPlanningSkill, ScheduledTask was imported. Let's make sure our firestoreClient supports it.
export interface ScheduledTask {
  task: WeeklyTaskV2;
  projectId?: string;
  rawProjectName?: string;
  displayName: string;
}

export interface UserSession {
  state: 'AWAITING_PROJECT_SELECTION' | 'AWAITING_PROJECT_NAME' | 'AWAITING_AREA_SELECTION' | 'AWAITING_DEFER_TIME' | 'AWAITING_HITL_CONFIRMATION';
  taskInput?: TaskInput;
  pendingProjectName?: string;
  pendingTaskId?: string;
  originalText?: string;
  candidateIntents?: string[];
  // HITL-specific fields (used when state === 'AWAITING_HITL_CONFIRMATION')
  classifiedIntent?: string;
  confidenceScore?: number;
  reasoning?: string;
}

const DB_PLAN_DRAFTS = 'plan_drafts';
const DB_USER_SESSIONS = 'user_sessions';
const DB_SYSTEM_STATS = 'system_stats';

const DRAFT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory mocks for offline test environment
const mockDrafts = new Map<string, { drafts: string; createdAt: string }>();
const mockSessions = new Map<string, { session: string; updatedAt: string }>();
const mockStats = new Map<string, number>();

// Instantiate firestore client unless in test mode
const db = process.env.NODE_ENV === 'test' ? null as any : new Firestore();

// ─── Plan Drafts ───

export async function saveDraft(draftId: string, drafts: ScheduledTask[]): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    mockDrafts.set(draftId, {
      drafts: JSON.stringify(drafts),
      createdAt: new Date().toISOString(),
    });
    return;
  }
  await db.collection(DB_PLAN_DRAFTS).doc(draftId).set({
    drafts: JSON.stringify(drafts),
    createdAt: new Date().toISOString(),
  });
}

export async function loadDraft(draftId: string): Promise<ScheduledTask[] | null> {
  if (process.env.NODE_ENV === 'test') {
    const draft = mockDrafts.get(draftId);
    if (!draft) return null;
    const diffMs = Date.now() - new Date(draft.createdAt).getTime();
    if (diffMs > DRAFT_TTL_MS) {
      mockDrafts.delete(draftId);
      return null;
    }
    return JSON.parse(draft.drafts) as ScheduledTask[];
  }

  const doc = await db.collection(DB_PLAN_DRAFTS).doc(draftId).get();
  if (!doc.exists) return null;
  const data = doc.data();

  const createdAt = data?.createdAt ? new Date(data.createdAt).getTime() : 0;
  if (Date.now() - createdAt > DRAFT_TTL_MS) {
    await deleteDraft(draftId);
    return null;
  }

  return JSON.parse(data?.drafts ?? '[]') as ScheduledTask[];
}

export async function deleteDraft(draftId: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    mockDrafts.delete(draftId);
    return;
  }
  await db.collection(DB_PLAN_DRAFTS).doc(draftId).delete();
}

// ─── User Conversational Sessions (with 5-minute TTL verification) ───

export async function saveSession(chatId: number | string, session: UserSession): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    mockSessions.set(String(chatId), {
      session: JSON.stringify(session),
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  await db.collection(DB_USER_SESSIONS).doc(String(chatId)).set({
    session: JSON.stringify(session),
    updatedAt: new Date().toISOString(),
  });
}

export async function loadSession(chatId: number | string): Promise<UserSession | null> {
  if (process.env.NODE_ENV === 'test') {
    const entry = mockSessions.get(String(chatId));
    if (!entry) return null;
    const diffMs = Date.now() - new Date(entry.updatedAt).getTime();
    if (diffMs > SESSION_TTL_MS) {
      console.log(`[Firestore Mock] Session expired (TTL > 5m). Deleting session for ${chatId}...`);
      mockSessions.delete(String(chatId));
      return null;
    }
    return JSON.parse(entry.session) as UserSession;
  }

  const doc = await db.collection(DB_USER_SESSIONS).doc(String(chatId)).get();
  if (!doc.exists) return null;
  const data = doc.data();

  const updatedAtStr = data?.updatedAt;
  if (updatedAtStr) {
    const diffMs = Date.now() - new Date(updatedAtStr).getTime();
    if (diffMs > SESSION_TTL_MS) {
      console.log(`[Firestore] Session expired (TTL > 5m). Deleting session for ${chatId}...`);
      await deleteSession(chatId);
      return null;
    }
  }

  return JSON.parse(data?.session ?? '{}') as UserSession;
}

export async function deleteSession(chatId: number | string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    mockSessions.delete(String(chatId));
    return;
  }
  await db.collection(DB_USER_SESSIONS).doc(String(chatId)).delete();
}

// ─── System Stats ───

export async function incrementDailyProCalls(date: string): Promise<number> {
  if (process.env.NODE_ENV === 'test') {
    const key = `proCalls_${date}`;
    const val = (mockStats.get(key) || 0) + 1;
    mockStats.set(key, val);
    return val;
  }

  const docRef = db.collection(DB_SYSTEM_STATS).doc(`proCalls_${date}`);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    await docRef.set({ count: 1 });
    return 1;
  }
  
  const currentCount = doc.data()?.count || 0;
  await docRef.update({ count: currentCount + 1 });
  return currentCount + 1;
}

export async function getDailyProCalls(date: string): Promise<number> {
  if (process.env.NODE_ENV === 'test') {
    return mockStats.get(`proCalls_${date}`) || 0;
  }

  const docRef = db.collection(DB_SYSTEM_STATS).doc(`proCalls_${date}`);
  const doc = await docRef.get();
  if (!doc.exists) return 0;
  return doc.data()?.count || 0;
}
