import { Client } from '@notionhq/client';
import { config } from '../config';
import type { TaskInput, TaskPage, ChecklistBlock, DailyLogPage, NotionBusySlot, WeeklyTaskV2 } from '../notion/types';

export const notion = process.env.NODE_ENV === 'test' ? null as any : new Client({ auth: config.NOTION_API_KEY });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface NotionPage {
  id: string;
  properties: Record<string, any>;
}

/**
 * Defensive execute wrapper that catches rate limits (429) and performs exponential backoff retries.
 */
async function executeNotionCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  if (process.env.NODE_ENV === 'test') {
    // Should never reach here since mock handlers bypass executeNotionCall, but safety fallback:
    return null as any;
  }

  let delayTime = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Staying defensively under limits
      await sleep(100);
      return await fn();
    } catch (error: any) {
      const status = error?.status;
      if (status === 429 && attempt < retries) {
        console.warn(`[Notion] Rate limit hit (429). Retrying in ${delayTime}ms... Attempt ${attempt + 1}/${retries}`);
        await sleep(delayTime);
        delayTime *= 2;
        continue;
      }
      if (attempt === retries) {
        throw error;
      }
      console.warn(`[Notion] API error (Status: ${status}). Retrying in ${delayTime}ms...`, error);
      await sleep(delayTime);
      delayTime *= 2;
    }
  }
  throw new Error('[Notion] Call failed after retries');
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

function getDateEnd(page: NotionPage, prop: string): string | undefined {
  const p = page.properties[prop] as { date?: { end?: string } };
  return p?.date?.end;
}

function getRelationId(page: NotionPage, prop: string): string | undefined {
  const p = page.properties[prop] as { relation?: Array<{ id: string }> };
  return p?.relation?.[0]?.id;
}

export async function countTasksInProject(projectId: string): Promise<number> {
  if (process.env.NODE_ENV === 'test') {
    return 2;
  }
  return executeNotionCall(async () => {
    const response = await notion.databases.query({
      database_id: config.NOTION_TASKS_DB_ID,
      filter: { property: 'Project', relation: { contains: projectId } },
    });
    return response.results.length;
  });
}

export async function createTask(
  task: TaskInput,
  projectId?: string,
  dailyLogId?: string,
  overrideChecklist?: { text: string; checked: boolean }[]
): Promise<string> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Created task: "${task.name}"`);
    return 'mock-task-id';
  }

  let taskPrefix = '';
  if (projectId) {
    const projectPage = await executeNotionCall(async () => 
      notion.pages.retrieve({ page_id: projectId })
    ) as any as NotionPage;
    const actualProjectName = getTitle(projectPage);
    if (actualProjectName) {
      const existingTasksCount = await countTasksInProject(projectId);
      taskPrefix = `${actualProjectName}_T${existingTasksCount + 1}: `;
    }
  }

  const properties: Record<string, any> = {
    Name: { title: [{ text: { content: `${taskPrefix}${task.name}` } }] },
    Priority: { select: { name: task.priority } },
    Estimate: { number: task.estimate },
    Date: { date: { start: task.dueDate } },
    Status: { select: { name: 'Not Started' } },
  };

  if (projectId) properties['Project'] = { relation: [{ id: projectId }] };
  if (dailyLogId) properties['Daily Log'] = { relation: [{ id: dailyLogId }] };

  const page = await executeNotionCall(async () => 
    notion.pages.create({
      parent: { database_id: config.NOTION_TASKS_DB_ID },
      properties: properties as any,
    })
  );

  const children: any[] = [];
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

  if (overrideChecklist && overrideChecklist.length > 0) {
    for (const item of overrideChecklist) {
      children.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: item.text } }],
          checked: item.checked,
        },
      });
    }
  } else if (task.checklist && task.checklist.length > 0) {
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
    await executeNotionCall(async () => 
      notion.blocks.children.append({
        block_id: page.id,
        children,
      })
    );
  }

  return page.id;
}

export async function getTaskChecklist(pageId: string): Promise<ChecklistBlock[]> {
  if (process.env.NODE_ENV === 'test') {
    return [
      { id: 'mock-todo-1', text: 'Task step 1', checked: false },
      { id: 'mock-todo-2', text: 'Task step 2', checked: true }
    ];
  }
  return executeNotionCall(async () => {
    const response = await notion.blocks.children.list({ block_id: pageId });
    return response.results
      .filter((b: any): b is any => 'type' in b && b.type === 'to_do')
      .map((b: any) => ({
        id: b.id,
        text: b.to_do.rich_text.map((r: any) => r.plain_text).join(''),
        checked: b.to_do.checked,
      }));
  });
}

export async function getTaskPage(pageId: string): Promise<TaskPage> {
  if (process.env.NODE_ENV === 'test') {
    return {
      id: pageId,
      name: 'Test Task Name',
      status: 'Not Started',
      priority: 'Medium',
      estimate: 1.5,
      dueDate: '2026-07-04',
      projectId: 'mock-proj-id',
      dailyLogId: 'mock-daily-log-id',
      checklistBlocks: [
        { id: 'mock-todo-1', text: 'Task step 1', checked: false }
      ],
    };
  }

  const page = await executeNotionCall(async () => 
    notion.pages.retrieve({ page_id: pageId })
  ) as any as NotionPage;
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

export async function queryTasksByDate(dateStr: string): Promise<TaskPage[]> {
  if (process.env.NODE_ENV === 'test') {
    return [await getTaskPage('mock-task-1')];
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_TASKS_DB_ID,
      filter: { property: 'Date', date: { equals: dateStr } },
    })
  );
  return Promise.all(response.results.map((p: any) => getTaskPage(p.id)));
}

export async function queryRescueCandidates(): Promise<TaskPage[]> {
  if (process.env.NODE_ENV === 'test') {
    return [await getTaskPage('mock-rescue-task')];
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
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
    })
  );
  return Promise.all(response.results.map((p: any) => getTaskPage(p.id)));
}

export async function findProjectByName(
  projectName: string
): Promise<{ id: string; name: string } | undefined> {
  if (process.env.NODE_ENV === 'test') {
    if (projectName.toLowerCase().includes('prj226')) {
      return { id: 'mock-proj-id', name: 'PRJ226' };
    }
    return undefined;
  }

  const needle = projectName.trim().toLowerCase();
  if (!needle) return undefined;

  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_PROJECTS_DB_ID,
    })
  );

  const candidates = (response.results as any as NotionPage[]).map((p: any) => ({
    id: p.id,
    name: getTitle(p),
  }));

  const exact = candidates.find((c) => c.name.toLowerCase() === needle);
  if (exact) return exact;

  return candidates.find(
    (c) =>
      c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
  );
}

export async function fetchActiveProjects(): Promise<{ id: string; name: string }[]> {
  if (process.env.NODE_ENV === 'test') {
    return [{ id: 'mock-proj-id', name: 'PRJ226' }];
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_PROJECTS_DB_ID,
      filter: { property: 'Status', select: { equals: 'Active' } },
    })
  );
  return (response.results as any as NotionPage[]).map((p: any) => ({
    id: p.id,
    name: getTitle(p),
  }));
}

export async function fetchAreas(): Promise<{ id: string; name: string }[]> {
  if (process.env.NODE_ENV === 'test') {
    return [
      { id: 'mock-area-1', name: 'Work' },
      { id: 'mock-area-2', name: 'Health' }
    ];
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_AREAS_DB_ID,
    })
  );
  return (response.results as any as NotionPage[]).map((p: any) => ({
    id: p.id,
    name: getTitle(p),
  }));
}

export async function createProject(name: string, areaId?: string): Promise<{ id: string; name: string }> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Created project: "${name}"`);
    return { id: 'mock-new-proj-id', name };
  }

  const properties: Record<string, any> = {
    Name: { title: [{ text: { content: name } }] },
    Status: { select: { name: 'Active' } },
  };
  if (areaId) {
    properties['Area'] = { relation: [{ id: areaId }] };
  }
  const newPage = await executeNotionCall(async () => 
    notion.pages.create({
      parent: { database_id: config.NOTION_PROJECTS_DB_ID },
      properties: properties as any,
    })
  );
  return { id: newPage.id, name };
}

export async function queryTasksByProject(
  projectId: string
): Promise<{ total: number; done: number }> {
  if (process.env.NODE_ENV === 'test') {
    return { total: 5, done: 3 };
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_TASKS_DB_ID,
      filter: { property: 'Project', relation: { contains: projectId } },
    })
  );
  const total = response.results.length;
  const done = (response.results as any as NotionPage[]).filter(
    (p) => getSelect(p, 'Status') === 'Done'
  ).length;
  return { total, done };
}

export async function updateTaskStatus(
  pageId: string,
  status: 'Not Started' | 'On Hold' | 'In Progress' | 'Done' | 'Archived' | 'Deferred'
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Updated task ${pageId} Status to ${status}`);
    return;
  }
  await executeNotionCall(async () => 
    notion.pages.update({
      page_id: pageId,
      properties: { Status: { select: { name: status } } },
    })
  );
}

export async function updateTaskEstimate(pageId: string, estimate: number): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Updated task ${pageId} Estimate to ${estimate}h`);
    return;
  }
  await executeNotionCall(async () => 
    notion.pages.update({
      page_id: pageId,
      properties: { Estimate: { number: estimate } },
    })
  );
}

export async function getOrCreateDailyLog(dateStr: string): Promise<DailyLogPage> {
  if (process.env.NODE_ENV === 'test') {
    return { id: 'mock-daily-log-id', title: dateStr };
  }

  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_DAILY_LOGS_DB_ID,
      filter: { property: 'Name', title: { equals: dateStr } },
    })
  );
  if (response.results.length > 0) {
    return { id: response.results[0].id, title: dateStr };
  }
  const newPage = await executeNotionCall(async () => 
    notion.pages.create({
      parent: { database_id: config.NOTION_DAILY_LOGS_DB_ID },
      properties: {
        Name: { title: [{ text: { content: dateStr } }] },
        Date: { date: { start: dateStr } },
      },
    })
  );
  return { id: newPage.id, title: dateStr };
}

export async function updateDailyLogHighlight(
  pageId: string,
  highlight: string
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Updated Daily Log ${pageId} Highlight: "${highlight}"`);
    return;
  }
  await executeNotionCall(async () => 
    notion.pages.update({
      page_id: pageId,
      properties: {
        Highlight: { rich_text: [{ type: 'text', text: { content: highlight } }] },
      },
    })
  );
}

export async function addResource(title: string, url: string, areaId: string): Promise<string> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Added resource: "${title}" (${url}) linked to area ${areaId}`);
    return 'mock-resource-id';
  }
  const newPage = await executeNotionCall(async () => 
    notion.pages.create({
      parent: { database_id: config.NOTION_RESOURCES_DB_ID },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        URL: { url: url },
        Area: { relation: [{ id: areaId }] },
      },
    })
  );
  return newPage.id;
}

export async function fetchActiveTasksWithDates(
  startDate: string,
  endDate: string
): Promise<NotionBusySlot[]> {
  if (process.env.NODE_ENV === 'test') {
    return [{ name: 'Mock Notion Task', start: '2026-07-04T10:00:00+08:00', end: '2026-07-04T12:00:00+08:00', estimate: 2 }];
  }
  const response = await executeNotionCall(async () => 
    notion.databases.query({
      database_id: config.NOTION_TASKS_DB_ID,
      filter: {
        and: [
          { property: 'Status', select: { does_not_equal: 'Done' } },
          { property: 'Status', select: { does_not_equal: 'Archived' } },
          { property: 'Date', date: { on_or_after: startDate } },
          { property: 'Date', date: { on_or_before: endDate } },
        ],
      },
      sorts: [{ property: 'Date', direction: 'ascending' }],
    })
  );

  return (response.results as any as NotionPage[]).map((p: any) => ({
    name: getTitle(p),
    start: getDate(p, 'Date'),
    end: getDateEnd(p, 'Date'),
    estimate: getNumber(p, 'Estimate'),
  }));
}

export async function createTaskV2(
  task: WeeklyTaskV2,
  projectId?: string,
  dailyLogId?: string
): Promise<string> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Notion Mock] Created TaskV2: "${task.properties.Name}"`);
    return 'mock-task-v2-id';
  }

  let taskPrefix = '';
  if (projectId) {
    const projectPage = await executeNotionCall(async () => 
      notion.pages.retrieve({ page_id: projectId })
    ) as any as NotionPage;
    const actualProjectName = getTitle(projectPage);
    if (actualProjectName) {
      taskPrefix = `[${actualProjectName}] `;
    }
  }

  const properties: Record<string, any> = {
    Name: { title: [{ text: { content: `${taskPrefix}${task.properties.Name}` } }] },
    Priority: { select: { name: task.properties.Priority } },
    Estimate: { number: task.properties.Estimate },
    Date: {
      date: {
        start: task.properties.Date.start,
        ...(task.properties.Date.end ? { end: task.properties.Date.end } : {}),
      },
    },
    Status: { select: { name: 'Not Started' } },
  };

  if (projectId) properties['Project'] = { relation: [{ id: projectId }] };
  if (dailyLogId) properties['Daily Log'] = { relation: [{ id: dailyLogId }] };

  const page = await executeNotionCall(async () => 
    notion.pages.create({
      parent: { database_id: config.NOTION_TASKS_DB_ID },
      properties: properties as any,
    })
  );

  const children: any[] = [];
  if (task.content.Callout_Description) {
    children.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '💡' },
        color: 'gray_background',
        rich_text: [{ type: 'text', text: { content: task.content.Callout_Description } }],
      },
    });
  }

  for (const item of task.content.Checklist) {
    children.push({
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [{ type: 'text', text: { content: item } }],
        checked: false,
      },
    });
  }

  if (children.length > 0) {
    await executeNotionCall(async () => 
      notion.blocks.children.append({
        block_id: page.id,
        children,
      })
    );
  }

  return page.id;
}
