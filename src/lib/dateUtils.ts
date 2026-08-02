/**
 * Centralized Date & Timezone utilities for PRJ226
 * Enforces local timezone formatting (default UTC+7 Asia/Bangkok / Asia/Ho_Chi_Minh)
 * for clean date-folder structure in Obsidian inbox and task snapshots.
 */

export function getLocalDate(date: Date = new Date(), offsetHours: number = 7): { dateStr: string; timePart: string } {
  const localMs = date.getTime() + offsetHours * 60 * 60 * 1000;
  const localDate = new Date(localMs);
  const iso = localDate.toISOString();
  const dateStr = iso.split('T')[0]; // YYYY-MM-DD
  const timePart = iso.split('T')[1].substring(0, 8).replace(/:/g, ''); // HHMMSS
  return { dateStr, timePart };
}
