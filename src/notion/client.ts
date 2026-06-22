import { Client } from '@notionhq/client';
import { config } from '../config';
import type { TaskInput, TaskPage, ChecklistBlock, DailyLogPage } from './types';

export const notion = new Client({ auth: config.NOTION_API_KEY });

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

function getTitle(page: NotionPage): string {
  const p = page.properties['Name'] as { title: Array<{ plain_text: string }> };
  return p?.title?.[0]?.plain_text ?? '';
}

function getSelect(page: NotionPage, prop: string): string {
  const p = page.properties[prop] as { select?: { name: string } };
  return p?.select?.name ?? '';
}

function getNumber(page: NotionPage, prop: string): number {
  const p = page.properties[prop] as { number?: number };
  return p?.number ?? 0;
}

function getDate(page: NotionPage, prop: string): string {
  const p = page.properties[prop] as { date?: { start: string } };
  return p?.date?.start ?? '';
}

function getRelationId(page: NotionPage, prop: string): string | undefined {
  const p = page.properties[prop] as { relation?: Array<{ id: string }> };
  return p?.relation?.[0]?.id;
}

export async function createTask(
  task: TaskInput,
  projectId?: string,
  dailyLogId?: string
): Promise<string> {
  let taskPrefix = '';
  if (projectId) {
    // Tự động fetch tên project thực tế từ Notion để làm prefix
    const projectPage = await notion.pages.retrieve({ page_id: projectId }) as NotionPage;
    const actualProjectName = getTitle(projectPage);
    if (actualProjectName) {
      const existingTasksCount = await countTasksInProject(projectId);
      taskPrefix = `${actualProjectName}_T${existingTasksCount + 1}: `;
    }
  }

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: `${taskPrefix}${task.name}` } }] },
    Priority: { select: { name: task.priority } },
    Estimate: { number: task.estimate },
    Date: { date: { start: task.dueDate } },
    Status: { select: { name: 'Not Started' } },
  };

  if (projectId) properties['Project'] = { relation: [{ id: projectId }] };
  if (dailyLogId) properties['Daily Log'] = { relation: [{ id: dailyLogId }] };

  const page = await notion.pages.create({
    parent: { database_id: config.NOTION_TASKS_DB_ID },
    properties: properties as any,
  });

  // Build page body children: callout (description) first, then checklist
  const children: any[] = [];

  // Callout block with context description (💡 gray_background)
  if (task.description) {
    children.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '💡' },
        color: 'gray_background',
        rich_text: [{ type: 'text', text: { content: task.description } }],
      },
    });
  }

  // Checklist to_do blocks
  if (task.checklist.length > 0) {
    for (const item of task.checklist) {
      children.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: item } }],
          checked: false,
        },
      });
    }
  }

  if (children.length > 0) {
    await notion.blocks.children.append({
      block_id: page.id,
      children,
    });
  }

  return page.id;
}

export async function getTaskPage(pageId: string): Promise<TaskPage> {
  const page = await notion.pages.retrieve({ page_id: pageId }) as NotionPage;
  const checklist = await getTaskChecklist(pageId);
  return {
    id: page.id,
    name: getTitle(page),
    status: getSelect(page, 'Status'),
    priority: getSelect(page, 'Priority') as TaskPage['priority'],
    estimate: getNumber(page, 'Estimate'),
    dueDate: getDate(page, 'Date'),
    projectId: getRelationId(page, 'Project'),
    dailyLogId: getRelationId(page, 'Daily Log'),
    checklistBlocks: checklist,
  };
}

export async function getTaskChecklist(pageId: string): Promise<ChecklistBlock[]> {
  const response = await notion.blocks.children.list({ block_id: pageId });
  return response.results
    .filter((b): b is Extract<typeof b, { type: 'to_do' }> => 'type' in b && b.type === 'to_do')
    .map((b) => ({
      id: b.id,
      text: b.to_do.rich_text.map((r: { plain_text: string }) => r.plain_text).join(''),
      checked: b.to_do.checked,
    }));
}

export async function queryTasksByDate(dateStr: string): Promise<TaskPage[]> {
  const response = await notion.databases.query({
    database_id: config.NOTION_TASKS_DB_ID,
    filter: { property: 'Date', date: { equals: dateStr } },
  });
  return Promise.all(response.results.map((p) => getTaskPage(p.id)));
}

export async function queryRescueCandidates(): Promise<TaskPage[]> {
  const response = await notion.databases.query({
    database_id: config.NOTION_TASKS_DB_ID,
    filter: {
      and: [
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Priority', select: { equals: 'High' } },
        { property: 'Estimate', number: { less_than_or_equal_to: 0.5 } },
      ],
    },
    sorts: [{ property: 'Date', direction: 'ascending' }],
    page_size: 1,
  });
  return Promise.all(response.results.map((p) => getTaskPage(p.id)));
}

/**
 * FR-7: Fuzzy-matches a project name against the Projects DB.
 * Returns the project page id and canonical name when a confident match is found.
 */
export async function findProjectByName(
  projectName: string
): Promise<{ id: string; name: string } | undefined> {
  const needle = projectName.trim().toLowerCase();
  if (!needle) return undefined;

  const response = await notion.databases.query({
    database_id: config.NOTION_PROJECTS_DB_ID,
  });

  const candidates = (response.results as NotionPage[]).map((p) => ({
    id: p.id,
    name: getTitle(p),
  }));

  // Exact (case-insensitive) match first, then substring containment either way.
  const exact = candidates.find((c) => c.name.toLowerCase() === needle);
  if (exact) return exact;

  return candidates.find(
    (c) =>
      c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
  );
}

export async function fetchActiveProjects(): Promise<{ id: string; name: string }[]> {
  const response = await notion.databases.query({
    database_id: config.NOTION_PROJECTS_DB_ID,
    filter: { property: 'Status', select: { equals: 'Active' } },
  });
  return (response.results as NotionPage[]).map((p) => ({
    id: p.id,
    name: getTitle(p),
  }));
}

export async function fetchAreas(): Promise<{ id: string; name: string }[]> {
  const response = await notion.databases.query({
    database_id: config.NOTION_AREAS_DB_ID,
  });
  return (response.results as NotionPage[]).map((p) => ({
    id: p.id,
    name: getTitle(p),
  }));
}

export async function createProject(name: string, areaId?: string): Promise<{ id: string; name: string }> {
  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: name } }] },
    Status: { select: { name: 'Active' } },
  };
  if (areaId) {
    properties['Area'] = { relation: [{ id: areaId }] };
  }
  const newPage = await notion.pages.create({
    parent: { database_id: config.NOTION_PROJECTS_DB_ID },
    properties: properties as any,
  });
  return { id: newPage.id, name };
}

/**
 * Counts existing tasks for a project, used to generate the sequential prefix.
 */
export async function countTasksInProject(projectId: string): Promise<number> {
  const response = await notion.databases.query({
    database_id: config.NOTION_TASKS_DB_ID,
    filter: { property: 'Project', relation: { contains: projectId } },
  });
  return response.results.length;
}

export async function queryTasksByProject(
  projectId: string
): Promise<{ total: number; done: number }> {
  const response = await notion.databases.query({
    database_id: config.NOTION_TASKS_DB_ID,
    filter: { property: 'Project', relation: { contains: projectId } },
  });
  const total = response.results.length;
  const done = (response.results as NotionPage[]).filter(
    (p) => getSelect(p, 'Status') === 'Done'
  ).length;
  return { total, done };
}

export async function updateTaskStatus(
  pageId: string,
  status: 'Not Started' | 'On Hold' | 'In Progress' | 'Done' | 'Archived'
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Status: { select: { name: status } } },
  });
}

export async function updateTaskEstimate(pageId: string, estimate: number): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Estimate: { number: estimate } },
  });
}

export async function getOrCreateDailyLog(dateStr: string): Promise<DailyLogPage> {
  const response = await notion.databases.query({
    database_id: config.NOTION_DAILY_LOGS_DB_ID,
    filter: { property: 'Name', title: { equals: dateStr } },
  });
  if (response.results.length > 0) {
    return { id: response.results[0].id, title: dateStr };
  }
  const newPage = await notion.pages.create({
    parent: { database_id: config.NOTION_DAILY_LOGS_DB_ID },
    properties: {
      Name: { title: [{ text: { content: dateStr } }] },
      Date: { date: { start: dateStr } },
    },
  });
  return { id: newPage.id, title: dateStr };
}

export async function updateDailyLogHighlight(
  pageId: string,
  highlight: string
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Highlight: { rich_text: [{ type: 'text', text: { content: highlight } }] },
    },
  });
}

/**
 * FR-8: Save a new resource/bookmark to the Resources Database.
 */
export async function addResource(title: string, url: string, areaId: string): Promise<string> {
  const newPage = await notion.pages.create({
    parent: { database_id: config.NOTION_RESOURCES_DB_ID },
    properties: {
      Name: { title: [{ text: { content: title } }] },
      URL: { url: url },
      Area: { relation: [{ id: areaId }] },
    },
  });
  return newPage.id;
}
