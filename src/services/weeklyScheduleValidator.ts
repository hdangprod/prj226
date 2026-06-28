import type { WeeklyTaskV2, NotionBusySlot } from '../notion/types';
import type { BusySlot } from '../google/client';

interface TimeInterval {
  startMs: number;
  endMs: number;
}

/**
 * Checks if a list of tasks has any temporal overlaps, 
 * including overlapping with existing GCal events or Notion tasks.
 */
export function hasTemporalOverlap(
  newTasks: WeeklyTaskV2[],
  gcalEvents: BusySlot[],
  notionTasks: NotionBusySlot[]
): boolean {
  const intervals: TimeInterval[] = [];

  // 1. Convert new AI tasks
  for (const t of newTasks) {
    if (t.properties.Date && t.properties.Date.start && t.properties.Date.end) {
      intervals.push({
        startMs: new Date(t.properties.Date.start).getTime(),
        endMs: new Date(t.properties.Date.end).getTime(),
      });
    }
  }

  // 2. Convert Google Calendar Events
  for (const e of gcalEvents) {
    intervals.push({
      startMs: new Date(e.start).getTime(),
      endMs: new Date(e.end).getTime(),
    });
  }

  // 3. Convert Existing Notion Tasks
  for (const nt of notionTasks) {
    const startMs = new Date(nt.start).getTime();
    let endMs: number;
    
    if (nt.end) {
      endMs = new Date(nt.end).getTime();
    } else {
      // If no end time, approximate using estimate (hours to ms)
      endMs = startMs + nt.estimate * 60 * 60 * 1000;
    }
    
    intervals.push({ startMs, endMs });
  }

  // Check overlaps
  if (intervals.length < 2) return false;

  // Sort tasks by start time
  intervals.sort((a, b) => a.startMs - b.startMs);

  for (let i = 0; i < intervals.length - 1; i++) {
    const currentEnd = intervals[i].endMs;
    const nextStart = intervals[i + 1].startMs;
    
    if (currentEnd > nextStart) {
      return true; // Overlap detected
    }
  }

  return false;
}
