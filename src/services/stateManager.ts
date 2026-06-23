import { Firestore } from '@google-cloud/firestore';
import type { PlannedTask } from '../skills/WeeklyPlanningSkill';
import type { TaskInput } from '../notion/types';

const DB_PLAN_DRAFTS = 'plan_drafts';
const DB_USER_SESSIONS = 'user_sessions';

const db = new Firestore();

// ─── Plan Drafts ───

export async function saveDraft(draftId: string, drafts: PlannedTask[]): Promise<void> {
  await db.collection(DB_PLAN_DRAFTS).doc(draftId).set({
    drafts: JSON.stringify(drafts),
    createdAt: new Date().toISOString(),
  });
}

export async function loadDraft(draftId: string): Promise<PlannedTask[] | null> {
  const doc = await db.collection(DB_PLAN_DRAFTS).doc(draftId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return JSON.parse(data?.drafts ?? '[]') as PlannedTask[];
}

export async function deleteDraft(draftId: string): Promise<void> {
  await db.collection(DB_PLAN_DRAFTS).doc(draftId).delete();
}

// ─── User Conversational Sessions ───

export interface UserSession {
  state: 'AWAITING_PROJECT_SELECTION' | 'AWAITING_PROJECT_NAME' | 'AWAITING_AREA_SELECTION' | 'AWAITING_DEFER_TIME';
  taskInput?: TaskInput;
  pendingProjectName?: string;
  pendingTaskId?: string;
}

export async function saveSession(chatId: number | string, session: UserSession): Promise<void> {
  await db.collection(DB_USER_SESSIONS).doc(String(chatId)).set({
    session: JSON.stringify(session),
    updatedAt: new Date().toISOString(),
  });
}

export async function loadSession(chatId: number | string): Promise<UserSession | null> {
  const doc = await db.collection(DB_USER_SESSIONS).doc(String(chatId)).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return JSON.parse(data?.session ?? '{}') as UserSession;
}

export async function deleteSession(chatId: number | string): Promise<void> {
  await db.collection(DB_USER_SESSIONS).doc(String(chatId)).delete();
}
