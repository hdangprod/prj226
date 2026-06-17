import { Firestore } from '@google-cloud/firestore';
import type { PlannedTask } from './taskService';

const COLLECTION = 'plan_drafts';

/**
 * Firestore client.
 * On GCP, authentication is automatic via the default service account.
 * Locally, set GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON.
 */
const db = new Firestore();

/**
 * Save a plan draft to Firestore.
 * @param draftId - unique short ID for this draft
 * @param drafts  - array of PlannedTask objects
 */
export async function saveDraft(draftId: string, drafts: PlannedTask[]): Promise<void> {
  await db.collection(COLLECTION).doc(draftId).set({
    drafts: JSON.stringify(drafts),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Load a plan draft from Firestore.
 * Returns null if the draft does not exist (expired or already consumed).
 */
export async function loadDraft(draftId: string): Promise<PlannedTask[] | null> {
  const doc = await db.collection(COLLECTION).doc(draftId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return JSON.parse(data?.drafts ?? '[]') as PlannedTask[];
}

/**
 * Delete a plan draft from Firestore (cleanup after confirm/cancel).
 */
export async function deleteDraft(draftId: string): Promise<void> {
  await db.collection(COLLECTION).doc(draftId).delete();
}
