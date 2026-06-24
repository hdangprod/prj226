import { AgentSkill } from './base';
import { planWeeklySchedule } from '../gemini/client';
import { BOT_MESSAGES } from '../constants/messages';
import { findProjectByName } from '../notion/client';
import { fetchUpcomingEvents, type BusySlot } from '../google/client';
import { fetchActiveTasksWithDates } from '../notion/client';
import { saveDraft } from '../services/stateManager';
import type { WeeklyTaskV2, NotionBusySlot } from '../notion/types';

// ─── Interfaces ───

export interface ScheduledTask {
  task: WeeklyTaskV2;
  projectId?: string;
  displayName: string;
}

export interface WeeklyPlanningInput {
  text: string;
  currentIsoTime: string;
}

export interface WeeklyPlanningOutput {
  draftId: string;
  drafts: ScheduledTask[];
  gcalEvents: BusySlot[];
}

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
      lines.push(`• [Notion] "${t.name}" → starts ${t.start}, est. ${t.estimate}h`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

// ─── Skill ───

export class WeeklyPlanningSkill implements AgentSkill<WeeklyPlanningInput, WeeklyPlanningOutput> {
  name = 'WeeklyPlanningSkill';
  description = 'V2: Fetches busy slots from GCal + Notion, runs AI temporal optimization, and saves draft for user review.';

  async execute(input: WeeklyPlanningInput): Promise<WeeklyPlanningOutput> {
    const weekEnd = getWeekEndDate(input.currentIsoTime);
    const todayStr = input.currentIsoTime.slice(0, 10);

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

    // Phase 2: AI-Driven Execution Optimization
    let parsed: WeeklyTaskV2[];
    try {
      parsed = await planWeeklySchedule(input.text, input.currentIsoTime, busySlotsContext);
    } catch (error) {
      throw new Error(BOT_MESSAGES.ERRORS.AI_PLANNING_FAULT);
    }

    // Phase 3: Resolve project IDs
    const drafts: ScheduledTask[] = [];
    for (const t of parsed) {
      let projectId: string | undefined;
      let displayName = t.properties.Name;

      if (t.properties.Project) {
        const project = await findProjectByName(t.properties.Project);
        if (project) {
          projectId = project.id;
          displayName = `${project.name}: ${t.properties.Name}`;
        } else {
          displayName = `[New] ${t.properties.Project}: ${t.properties.Name}`;
        }
      }

      drafts.push({ task: t, projectId, displayName });
    }

    // Phase 4: Save draft with metadata
    const draftId = newDraftId();
    await saveDraft(draftId, drafts);

    return { draftId, drafts, gcalEvents };
  }
}
