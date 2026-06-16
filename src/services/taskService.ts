import { parseTaskInput, parseWeeklyPlan, translateHighlight } from '../gemini/client';
import { 
  createTask, 
  findProjectByName, 
  getOrCreateDailyLog,
  getTaskPage,
  getTaskChecklist,
  updateTaskStatus,
  updateTaskEstimate,
  queryRescueCandidates,
  updateDailyLogHighlight
} from '../notion/client';

/**
 * Handle /add_task logic
 */
export async function processSingleTask(text: string): Promise<string> {
  const currentDate = new Date().toISOString().split('T')[0];
  
  // 1. Parse text using Gemini
  const parsedTask = await parseTaskInput(text, currentDate);

  // 2. Find project ID if project name is mentioned
  let projectId: string | undefined;
  if (parsedTask.projectName) {
    const project = await findProjectByName(parsedTask.projectName);
    if (project) {
      projectId = project.id;
    }
  }

  // 3. Get or create Daily Log for today
  const dailyLog = await getOrCreateDailyLog(currentDate);

  // 4. Create Task in Notion
  const taskId = await createTask(
    parsedTask,
    projectId,
    dailyLog.id
  );

  return `Successfully created task: *${parsedTask.name}*\nProject: ${parsedTask.projectName || 'None'}\nPriority: ${parsedTask.priority}\nEstimate: ${parsedTask.estimate}h\n[View in Notion](https://notion.so/${taskId.replace(/-/g, '')})`;
}

/**
 * Handle /rescue logic
 */
export async function getRescueTask(): Promise<string> {
  const candidates = await queryRescueCandidates();
  if (candidates.length === 0) {
    return 'No rescue tasks found! Great job keeping your high-priority short tasks clear.';
  }

  const task = candidates[0];
  return `🚨 *Focus Rescue Task* 🚨\n\n*${task.name}*\nPriority: High\nEstimate: ${task.estimate}h\n[View in Notion](https://notion.so/${task.id.replace(/-/g, '')})\n\nDo this right now to gain momentum!`;
}

/**
 * Handle /highlight logic
 */
export async function processHighlight(text: string): Promise<string> {
  const currentDate = new Date().toISOString().split('T')[0];
  const translated = await translateHighlight(text);
  
  const dailyLog = await getOrCreateDailyLog(currentDate);
  await updateDailyLogHighlight(dailyLog.id, translated);

  return `Highlight updated successfully for today!\n*English Translation:* ${translated}`;
}

/**
 * Handle rollover (Defer) logic
 */
export async function deferTask(taskId: string): Promise<string> {
  const task = await getTaskPage(taskId);
  
  // Cut estimate in half (earned value)
  const newEstimate = task.estimate / 2;
  await updateTaskEstimate(taskId, newEstimate);
  
  // Mark old task as done
  await updateTaskStatus(taskId, 'Done');

  // Clone a new task for tomorrow with unchecked items
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const uncheckedItems = task.checklistBlocks.filter(b => !b.checked).map(b => b.text);

  const newTaskInput = {
    name: `[Rollover] ${task.name}`,
    priority: task.priority,
    estimate: newEstimate,
    dueDate: tomorrowStr,
    checklist: uncheckedItems,
  };

  const dailyLog = await getOrCreateDailyLog(tomorrowStr);

  await createTask(newTaskInput, task.projectId, dailyLog.id);

  return `Task deferred! Half the estimate was logged as completed today, and the rest rolled over to tomorrow.`;
}

/**
 * Handle /plan_week logic (Preview phase)
 */
export async function processWeeklyPlanPreview(text: string): Promise<any[]> {
  const currentDate = new Date().toISOString().split('T')[0];
  const parsedTasks = await parseWeeklyPlan(text, currentDate);
  // Return parsed tasks so index.ts can format them and ask for confirmation
  return parsedTasks;
}

/**
 * Handle bulk creation confirmation
 */
export async function bulkCreateTasks(tasks: any[]): Promise<string> {
  let createdCount = 0;
  for (const t of tasks) {
    let projectId: string | undefined;
    if (t.projectName) {
      const project = await findProjectByName(t.projectName);
      if (project) projectId = project.id;
    }
    await createTask(t, projectId);
    createdCount++;
  }
  return `Successfully bulk-created ${createdCount} tasks!`;
}
