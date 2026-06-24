import { parseTaskInput, translateHighlight } from '../gemini/client';
import {
  createTask,
  createTaskV2,
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
  createProject,
} from '../notion/client';
import type { TaskInput, TaskPage, GeminiTaskOutput } from '../notion/types';
import type { ScheduledTask } from '../skills/WeeklyPlanningSkill';

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
  todayStr: string,
  currentIsoTime: string,
  _chatId?: number,
  dailyLogId?: string
): Promise<string> {
  const parsed = await parseTaskInput(text, currentIsoTime);

  let projectId: string | undefined;
  if (parsed.projectName) {
    const project = await findProjectByName(parsed.projectName);
    if (project) projectId = project.id;
  }

  const logId = dailyLogId ?? (await getOrCreateDailyLog(todayStr)).id;

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
  tomorrowDefaultTime: string,
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
    dueDate: tomorrowDefaultTime,
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

// ─── FR-7 V2: Bulk Create (Weekly Scheduler) ───

export interface BulkCreateResult {
  createdCount: number;
  taskIds: string[];
}

/**
 * V2: Bulk create tasks from ScheduledTask[] with throttling.
 */
export async function bulkCreateTasksV2(
  drafts: ScheduledTask[],
): Promise<BulkCreateResult> {
  const taskIds: string[] = [];
  const projectCache = new Map<string, string>();
  const dailyLogCache = new Map<string, string>();

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    let projectId = d.projectId;

    // Auto-create Project if missing but rawProjectName exists
    if (!projectId && d.rawProjectName) {
      if (projectCache.has(d.rawProjectName)) {
        projectId = projectCache.get(d.rawProjectName);
      } else {
        const newProj = await createProject(d.rawProjectName);
        projectId = newProj.id;
        projectCache.set(d.rawProjectName, projectId);
      }
    }

    // Auto-create/link Daily Log
    let dailyLogId: string | undefined;
    if (d.task.properties.Date && d.task.properties.Date.start) {
      const dateStr = d.task.properties.Date.start.split('T')[0];
      if (dateStr) {
        if (dailyLogCache.has(dateStr)) {
          dailyLogId = dailyLogCache.get(dateStr);
        } else {
          const logPage = await getOrCreateDailyLog(dateStr);
          dailyLogId = logPage.id;
          if (dailyLogId) dailyLogCache.set(dateStr, dailyLogId);
        }
      }
    }

    const id = await createTaskV2(d.task, projectId, dailyLogId);
    taskIds.push(id);
    // Throttle 200ms between API calls to avoid Notion rate limits (HTTP 429)
    if (i < drafts.length - 1) {
      await delay(200);
    }
  }
  return { createdCount: taskIds.length, taskIds };
}
