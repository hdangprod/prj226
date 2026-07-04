import { planWeeklySchedule } from '../gemini/client';
import { fetchUpcomingEvents, type BusySlot } from '../tools/googleClient';
import { fetchActiveTasksWithDates, findProjectByName, createTaskV2, getOrCreateDailyLog } from '../tools/notionClient';
import { saveDraft, loadDraft, deleteDraft, type ScheduledTask } from '../tools/firestoreClient';
import { sendMessage, escapeHtml } from '../tools/telegramClient';
import { BOT_MESSAGES } from '../constants/messages';
import type { WeeklyTaskV2, NotionBusySlot } from '../notion/types';

// ─── Helpers ───

function newDraftId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Computes the end of the current ISO week (Sunday 23:59:59).
 */
function getWeekEndDate(currentIsoTime: string): string {
  const d = new Date(currentIsoTime);
  const dayOfWeek = d.getDay(); // 0=Sun
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds a human-readable Busy_Slots_Context string from Google Calendar events and Notion tasks.
 */
function buildBusySlotsContext(gcalEvents: BusySlot[], notionTasks: NotionBusySlot[]): string {
  const lines: string[] = [];

  if (gcalEvents.length > 0) {
    lines.push('--- Google Calendar Events ---');
    for (const e of gcalEvents) {
      lines.push(`• [GCal] "${e.summary}" → ${e.start} to ${e.end}`);
    }
  }

  if (notionTasks.length > 0) {
    lines.push('--- Existing Notion Tasks ---');
    for (const t of notionTasks) {
      if (t.end) {
        lines.push(`• [Notion] "${t.name}" → ${t.start} to ${t.end}`);
      } else {
        lines.push(`• [Notion] "${t.name}" → starts ${t.start}, est. ${t.estimate}h`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

const THROTTLE_DELAY_MS = 350;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Skill Entry Point ───

/**
 * Weekly Planning Skill: Orchestrates the full weekly planning workflow.
 *
 * Phase 1: Parallel aggregation of busy slots (GCal + Notion).
 * Phase 2: AI-driven schedule optimization via Gemini PRO.
 * Phase 3: Project ID resolution for each scheduled task.
 * Phase 4: Draft persistence for user review before committing to Notion.
 *
 * @returns Draft ID, scheduled tasks, GCal events, and model metadata
 */
export async function executeWeeklyPlanning(
  chatId: number | string,
  userInput: string,
  currentIsoTime: string,
): Promise<{ draftId: string; draftCount: number }> {
  const weekEnd = getWeekEndDate(currentIsoTime);
  const todayStr = currentIsoTime.slice(0, 10);

  // Phase 1: Parallel aggregation of busy slots
  const [gcalEvents, notionTasks] = await Promise.all([
    fetchUpcomingEvents(todayStr, weekEnd).catch((err) => {
      console.warn('[WeeklyPlanning] GCal fetch failed, continuing without:', err);
      return [] as BusySlot[];
    }),
    fetchActiveTasksWithDates(todayStr, weekEnd).catch((err) => {
      console.warn('[WeeklyPlanning] Notion busy-slots fetch failed, continuing without:', err);
      return [] as NotionBusySlot[];
    }),
  ]);

  const busySlotsContext = buildBusySlotsContext(gcalEvents, notionTasks);

  // Phase 2: AI-Driven Schedule Optimization
  const parsed = await planWeeklySchedule(userInput, currentIsoTime, busySlotsContext);
  if (!parsed || parsed.length === 0) {
    throw new Error(BOT_MESSAGES.ERRORS.AI_PLANNING_FAULT);
  }

  // Phase 3: Resolve project IDs
  const drafts: ScheduledTask[] = [];
  for (const t of parsed) {
    let projectId: string | undefined;
    let displayName = t.properties.Name;
    const rawProjectName = t.properties.Project;

    if (t.properties.Project) {
      const project = await findProjectByName(t.properties.Project);
      if (project) {
        projectId = project.id;
        displayName = `${project.name}: ${t.properties.Name}`;
      } else {
        displayName = `[New] ${t.properties.Project}: ${t.properties.Name}`;
      }
    }

    drafts.push({ task: t, projectId, rawProjectName, displayName });
  }

  // Phase 4: Save draft for user review
  const draftId = newDraftId();
  await saveDraft(draftId, drafts);

  // Build preview message
  const previewLines = drafts.map((d, i) =>
    `${i + 1}. <b>${escapeHtml(d.displayName)}</b> — ${d.task.properties.Priority} — ${d.task.properties.Estimate}h\n   📅 ${d.task.properties.Date.start.slice(0, 16).replace('T', ' ')}`
  );

  const previewMessage =
    `📋 <b>Bản nháp lịch trình tuần</b> (${drafts.length} tasks):\n\n` +
    previewLines.join('\n') +
    `\n\nDraft ID: <code>${draftId}</code>`;

  await sendMessage(chatId, previewMessage, {
    inline_keyboard: [
      [{ text: BOT_MESSAGES.BUTTONS.APPROVE_SCHEDULE, callback_data: `weekly_approve:${draftId}` }],
      [{ text: BOT_MESSAGES.BUTTONS.CANCEL_SCHEDULE, callback_data: `weekly_cancel:${draftId}` }],
    ],
  });

  return { draftId, draftCount: drafts.length };
}

/**
 * Commits a previously saved draft to Notion.
 * Creates tasks sequentially with 350ms throttle delays to avoid Notion rate limits.
 *
 * @returns Number of successfully created tasks
 */
export async function commitWeeklyDraft(
  chatId: number | string,
  draftId: string,
): Promise<number> {
  const drafts = await loadDraft(draftId);
  if (!drafts || drafts.length === 0) {
    throw new Error(BOT_MESSAGES.ERRORS.PLAN_EXPIRED);
  }

  let createdCount = 0;
  const total = drafts.length;

  for (const d of drafts) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyLog = await getOrCreateDailyLog(todayStr);

    await createTaskV2(d.task, d.projectId, dailyLog.id);
    createdCount++;

    // Throttle Notion writes per AGENTS.md rate-limiting guardrails (350ms between calls)
    if (createdCount < total) {
      await sleep(THROTTLE_DELAY_MS);
    }
  }

  // Clean up the draft
  await deleteDraft(draftId);

  return createdCount;
}
