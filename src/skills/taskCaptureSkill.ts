import { parseTaskInput } from '../tools/geminiClient';
import { findProjectByName, createTask, getOrCreateDailyLog } from '../tools/notionClient';
import type { TaskInput } from '../types/notion';

export interface TaskCaptureResult {
  status: 'success' | 'needs_project_selection';
  taskId?: string;
  taskName?: string;
  projectName?: string;
  taskInput?: TaskInput;
}

/**
 * taskCaptureSkill: Agentic workflow to parse, match projects, and capture tasks in Notion.
 */
export async function executeTaskCapture(
  text: string,
  currentIsoTime: string,
  todayStr: string
): Promise<TaskCaptureResult> {
  const parsed = await parseTaskInput(text, currentIsoTime);

  if (parsed.projectName) {
    const matchedProject = await findProjectByName(parsed.projectName);
    if (matchedProject) {
      const dailyLog = await getOrCreateDailyLog(todayStr);
      const taskId = await createTask(parsed, matchedProject.id, dailyLog.id);
      return {
        status: 'success',
        taskId,
        taskName: parsed.name,
        projectName: matchedProject.name,
      };
    }
  }

  // If no project could be resolved, fall back to project selection
  return {
    status: 'needs_project_selection',
    taskInput: parsed,
  };
}
