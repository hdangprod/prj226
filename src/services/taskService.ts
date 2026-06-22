import { parseTaskInput, translateHighlight } from '../gemini/client';
import {
  createTask,
  findProjectByName,
  getOrCreateDailyLog,
  getTaskPage,
  updateTaskStatus,
  updateTaskEstimate,
  queryTasksByDate,
  queryRescueCandidates,
  queryTasksByProject,
  updateDailyLogHighlight,
  countTasksInProject,
} from '../notion/client';
import type { TaskInput, TaskPage, GeminiTaskOutput } from '../notion/types';
import type { PlannedTask } from '../skills/WeeklyPlanningSkill';

// ─── Helpers ───

function notionDeepLink(pageId: string): string {
  return `notion://notion.so/${pageId.replace(/-/g, '')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── FR-1: Add Task ───

export async function addTaskFromText(
  text: string,
  today: string,
  _chatId?: number,
  dailyLogId?: string
): Promise<string> {
  const parsed = await parseTaskInput(text, today);

  let projectId: string | undefined;
  if (parsed.projectName) {
    const project = await findProjectByName(parsed.projectName);
    if (project) projectId = project.id;
  }

  const logId = dailyLogId ?? (await getOrCreateDailyLog(today)).id;

  const taskId = await createTask(parsed, projectId, logId);
  return taskId;
}

// ─── FR-2: View Today Tasks ───

export async function viewTodayTasks(today: string): Promise<string> {
  const tasks = await queryTasksByDate(today);

  if (tasks.length === 0) {
    return '🎉 Hôm nay không còn task nào chưa hoàn thành!';
  }

  const lines: string[] = ['📋 *Danh sách task hôm nay:*\n'];
  for (const t of tasks) {
    let projectInfo = 'Không có';
    if (t.projectId) {
      const progress = await queryTasksByProject(t.projectId);
      const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
      projectInfo = `(Tiến độ: ${pct}%)`;
    }
    lines.push(
      `• *${t.name}*\n  Priority: ${t.priority} | Est: ${t.estimate}h | Project: ${projectInfo}`
    );
  }
  return lines.join('\n');
}

/**
 * Returns today's tasks as structured data (for inline keyboard rendering).
 */
export async function getTodayTaskPages(today: string): Promise<TaskPage[]> {
  return queryTasksByDate(today);
}

// ─── FR-3: Complete Task ───

export async function completeTask(taskId: string): Promise<void> {
  await updateTaskStatus(taskId, 'Done');
}

// ─── FR-3: Defer / Rollover ───

export async function rolloverTask(
  task: TaskPage,
  tomorrowStr: string,
  spentHours?: number
): Promise<string> {
  let newEstimate = task.estimate / 2;
  if (spentHours !== undefined && !isNaN(spentHours)) {
    newEstimate = Math.max(0, task.estimate - spentHours);
  }

  // Update old task
  await updateTaskEstimate(task.id, spentHours !== undefined && !isNaN(spentHours) ? spentHours : task.estimate / 2);
  await updateTaskStatus(task.id, 'Deferred');

  const newTaskInput: TaskInput = {
    name: `[Rollover] ${task.name}`,
    priority: task.priority,
    estimate: newEstimate,
    dueDate: tomorrowStr,
    checklist: [], // handled by overrideChecklist
  };

  const dailyLog = await getOrCreateDailyLog(tomorrowStr);
  const newId = await createTask(newTaskInput, task.projectId, dailyLog.id, task.checklistBlocks);
  return newId;
}

export async function getTaskById(taskId: string): Promise<TaskPage> {
  return getTaskPage(taskId);
}

// ─── FR-4: Rescue ───

export async function rescueTask(): Promise<TaskPage | null> {
  const candidates = await queryRescueCandidates();
  return candidates.length > 0 ? candidates[0] : null;
}

// ─── FR-7: Plan Week Draft ───
// Logic đã được chuyển sang src/skills/WeeklyPlanningSkill.ts

// ─── FR-7: Bulk Create ───

export interface BulkCreateResult {
  createdCount: number;
  taskIds: string[];
}

export async function bulkCreateTasks(
  drafts: PlannedTask[],
  dailyLogId?: string
): Promise<BulkCreateResult> {
  const taskIds: string[] = [];
  for (const d of drafts) {
    const id = await createTask(d.task, d.projectId, dailyLogId);
    taskIds.push(id);
    // Throttle 350ms between API calls to avoid Notion rate limits (HTTP 429)
    if (drafts.indexOf(d) < drafts.length - 1) {
      await delay(350);
    }
  }
  return { createdCount: taskIds.length, taskIds };
}
