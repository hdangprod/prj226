import type { WeeklyTaskV2 } from '../notion/types';

/**
 * Checks if a list of tasks has any temporal overlaps.
 * Assumes Date.start and Date.end are valid ISO 8601 strings.
 * Returns true if an overlap is found, false otherwise.
 */
export function hasTemporalOverlap(tasks: WeeklyTaskV2[]): boolean {
  // Only consider tasks with both start and end dates
  const scheduledTasks = tasks.filter(t => t.properties.Date && t.properties.Date.start && t.properties.Date.end);
  
  if (scheduledTasks.length < 2) return false;
  
  // Sort tasks by start time
  scheduledTasks.sort((a, b) => {
    return new Date(a.properties.Date.start!).getTime() - new Date(b.properties.Date.start!).getTime();
  });
  
  // Check for overlaps
  for (let i = 0; i < scheduledTasks.length - 1; i++) {
    const currentTask = scheduledTasks[i];
    const nextTask = scheduledTasks[i + 1];
    
    const currentEnd = new Date(currentTask.properties.Date.end!).getTime();
    const nextStart = new Date(nextTask.properties.Date.start!).getTime();
    
    if (currentEnd > nextStart) {
      return true; // Overlap detected
    }
  }
  
  return false;
}
