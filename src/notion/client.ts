import { Client } from '@notionhq/client';
import { config } from '../config';
import {
  TaskInput,
  NotionTask,
  NotionProject,
  NotionDailyLog,
  NotionArea,
  NotionResource,
  ChecklistItem
} from './types';

export class NotionSecondBrainClient {
  private notion: Client;

  constructor() {
    this.notion = new Client({ auth: config.NOTION_TOKEN });
  }

  /**
   * Helper to format Date object to YYYY-MM-DD in local Vietnam/Singapore time
   */
  public getLocalDateString(date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  }

  /**
   * Find or create a Daily Log entry for a specific date (YYYY-MM-DD)
   */
  public async findOrCreateDailyLog(dateStr: string): Promise<string> {
    try {
      const response = await this.notion.databases.query({
        database_id: config.DAILY_LOGS_DB_ID,
        filter: {
          property: 'Name',
          title: {
            equals: dateStr
          }
        }
      });

      if (response.results.length > 0) {
        return response.results[0].id;
      }

      // Create a new Daily Log page
      const newPage = await this.notion.pages.create({
        parent: { database_id: config.DAILY_LOGS_DB_ID },
        properties: {
          Name: {
            title: [{ text: { content: dateStr } }]
          },
          Date: {
            date: { start: dateStr }
          }
        }
      });

      return newPage.id;
    } catch (error: any) {
      console.error(`Error in findOrCreateDailyLog for ${dateStr}:`, error);
      throw error;
    }
  }

  /**
   * Add a new Task to Notion, linking it to a Project and a Daily Log page
   */
  public async addTask(
    task: TaskInput,
    projectId?: string,
    dailyLogId?: string
  ): Promise<string> {
    try {
      const properties: any = {
        Name: { title: [{ text: { content: task.name } }] },
        Priority: { select: { name: task.priority } },
        Estimate: { number: task.estimate },
        Date: { date: { start: task.dueDate } }
      };

      // Handle Task Status (Notion status field or select fallback)
      const statusValue = task.status || 'Not Started';
      properties.Status = { status: { name: statusValue } };

      if (projectId) {
        properties.Project = { relation: [{ id: projectId }] };
      }

      if (dailyLogId) {
        properties['Daily Log'] = { relation: [{ id: dailyLogId }] };
      }

      const response = await this.notion.pages.create({
        parent: { database_id: config.TASKS_DB_ID },
        properties
      });

      const taskId = response.id;

      // Add checklist items as to_do blocks in the page content
      if (task.checklist.length > 0) {
        await this.notion.blocks.children.append({
          block_id: taskId,
          children: task.checklist.map(item => ({
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [{ type: 'text', text: { content: item } }],
              checked: false
            }
          }))
        });
      }

      return taskId;
    } catch (error: any) {
      console.error('Error in addTask:', error);
      throw error;
    }
  }

  /**
   * Get Task detail along with checklist block states (checked/unchecked)
   */
  public async getTaskWithChecklist(taskId: string): Promise<NotionTask> {
    try {
      const page: any = await this.notion.pages.retrieve({ page_id: taskId });
      const props = page.properties;

      // Parse fields safely
      const name = props.Name?.title?.[0]?.text?.content || 'Untitled Task';
      const status = props.Status?.status?.name || props.Status?.select?.name || 'Not Started';
      const priority = props.Priority?.select?.name || 'Medium';
      const estimate = props.Estimate?.number || 0;
      const dueDate = props.Date?.date?.start || '';
      
      const projectId = props.Project?.relation?.[0]?.id || undefined;
      const dailyLogId = props['Daily Log']?.relation?.[0]?.id || undefined;

      // Retrieve checklist block children
      const blocksResponse = await this.notion.blocks.children.list({
        block_id: taskId
      });

      const checklist: ChecklistItem[] = [];
      for (const block of blocksResponse.results) {
        if ('type' in block && block.type === 'to_do') {
          checklist.push({
            id: block.id,
            text: block.to_do.rich_text?.[0]?.plain_text || '',
            checked: block.to_do.checked
          });
        }
      }

      return {
        id: taskId,
        name,
        status,
        priority,
        estimate,
        dueDate,
        projectId,
        dailyLogId,
        checklist
      };
    } catch (error: any) {
      console.error(`Error in getTaskWithChecklist for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Mark Task as Done in Notion (supports both status & select field names)
   */
  public async completeTask(taskId: string): Promise<void> {
    try {
      // Fetch page first to see what properties it has
      const page: any = await this.notion.pages.retrieve({ page_id: taskId });
      const statusProp = page.properties.Status;
      
      const properties: any = {};
      if (statusProp?.type === 'select') {
        properties.Status = { select: { name: 'Done' } };
      } else {
        properties.Status = { status: { name: 'Done' } };
      }

      await this.notion.pages.update({
        page_id: taskId,
        properties
      });
    } catch (error: any) {
      console.error(`Error in completeTask for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update the task's estimate property in Notion
   */
  public async updateTaskEstimate(taskId: string, newEstimate: number): Promise<void> {
    try {
      await this.notion.pages.update({
        page_id: taskId,
        properties: {
          Estimate: { number: newEstimate }
        }
      });
    } catch (error: any) {
      console.error(`Error in updateTaskEstimate for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Clone a task for tomorrow, moving only unchecked checklist blocks
   */
  public async cloneTaskForTomorrow(
    originalTask: NotionTask,
    uncheckedItems: ChecklistItem[],
    newEstimate: number
  ): Promise<string> {
    try {
      // Calculate tomorrow's date string
      const taskDate = originalTask.dueDate ? new Date(originalTask.dueDate) : new Date();
      taskDate.setDate(taskDate.getDate() + 1);
      const tomorrowStr = this.getLocalDateString(taskDate);

      // Get or create Daily Log for tomorrow
      const tomorrowDailyLogId = await this.findOrCreateDailyLog(tomorrowStr);

      const properties: any = {
        Name: { title: [{ text: { content: `[Rollover] ${originalTask.name}` } }] },
        Status: { status: { name: 'Not Started' } },
        Priority: { select: { name: originalTask.priority } },
        Estimate: { number: newEstimate },
        Date: { date: { start: tomorrowStr } }
      };

      if (originalTask.projectId) {
        properties.Project = { relation: [{ id: originalTask.projectId }] };
      }

      properties['Daily Log'] = { relation: [{ id: tomorrowDailyLogId }] };

      const response = await this.notion.pages.create({
        parent: { database_id: config.TASKS_DB_ID },
        properties
      });

      const clonedTaskId = response.id;

      // Append unchecked items as new to_do blocks
      if (uncheckedItems.length > 0) {
        await this.notion.blocks.children.append({
          block_id: clonedTaskId,
          children: uncheckedItems.map(item => ({
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [{ type: 'text', text: { content: item.text } }],
              checked: false
            }
          }))
        });
      }

      return clonedTaskId;
    } catch (error: any) {
      console.error(`Error in cloneTaskForTomorrow for task ${originalTask.id}:`, error);
      throw error;
    }
  }

  /**
   * Fetch active, non-completed tasks scheduled for today
   */
  public async fetchTodayTasks(): Promise<NotionTask[]> {
    try {
      const todayStr = this.getLocalDateString();
      const todayDailyLogId = await this.findOrCreateDailyLog(todayStr);

      // Query tasks database where 'Daily Log' relation has todayDailyLogId and Status is not Done/Archived
      const response = await this.notion.databases.query({
        database_id: config.TASKS_DB_ID,
        filter: {
          and: [
            {
              property: 'Daily Log',
              relation: {
                contains: todayDailyLogId
              }
            },
            {
              property: 'Status',
              status: {
                does_not_equal: 'Done'
              }
            },
            {
              property: 'Status',
              status: {
                does_not_equal: 'Archived'
              }
            }
          ]
        }
      });

      const tasks: NotionTask[] = [];
      for (const result of response.results) {
        const fullTask = await this.getTaskWithChecklist(result.id);
        tasks.push(fullTask);
      }

      return tasks;
    } catch (error: any) {
      console.error('Error in fetchTodayTasks:', error);
      throw error;
    }
  }

  /**
   * Fetch active projects from database
   */
  public async fetchActiveProjects(): Promise<NotionProject[]> {
    try {
      const response = await this.notion.databases.query({
        database_id: config.PROJECTS_DB_ID
      });

      return response.results.map((page: any) => {
        const name = page.properties.Name?.title?.[0]?.text?.content || 'Untitled Project';
        const status = page.properties.Status?.status?.name || page.properties.Status?.select?.name || 'Active';
        const areaId = page.properties.Area?.relation?.[0]?.id || undefined;
        return {
          id: page.id,
          name,
          status,
          areaId
        };
      });
    } catch (error: any) {
      console.error('Error in fetchActiveProjects:', error);
      throw error;
    }
  }

  /**
   * Query all tasks for a project and calculate completion progress
   */
  public async fetchProjectTasksProgress(
    projectId: string
  ): Promise<{ completed: number; total: number }> {
    try {
      const response = await this.notion.databases.query({
        database_id: config.TASKS_DB_ID,
        filter: {
          property: 'Project',
          relation: {
            contains: projectId
          }
        }
      });

      let completed = 0;
      const total = response.results.length;

      for (const result of response.results) {
        const page: any = result;
        const status = page.properties.Status?.status?.name || page.properties.Status?.select?.name || 'Not Started';
        if (status === 'Done') {
          completed++;
        }
      }

      return { completed, total };
    } catch (error: any) {
      console.error(`Error in fetchProjectTasksProgress for project ${projectId}:`, error);
      throw { completed: 0, total: 0 };
    }
  }

  /**
   * Fetch tasks updated within the last 7 days (or matching weekly dates) for retrospective
   */
  public async fetchWeeklyTasksForReport(): Promise<NotionTask[]> {
    try {
      // Fetch all tasks matching the Date property of the past 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const oneWeekAgoStr = this.getLocalDateString(oneWeekAgo);

      const response = await this.notion.databases.query({
        database_id: config.TASKS_DB_ID,
        filter: {
          property: 'Date',
          date: {
            on_or_after: oneWeekAgoStr
          }
        }
      });

      const tasks: NotionTask[] = [];
      for (const result of response.results) {
        const fullTask = await this.getTaskWithChecklist(result.id);
        tasks.push(fullTask);
      }

      return tasks;
    } catch (error: any) {
      console.error('Error in fetchWeeklyTasksForReport:', error);
      throw error;
    }
  }

  /**
   * Update the Daily Log page with a textual Highlight summary (transcription text in English)
   */
  public async updateDailyLogHighlight(dateStr: string, highlight: string): Promise<void> {
    try {
      const logId = await this.findOrCreateDailyLog(dateStr);
      await this.notion.pages.update({
        page_id: logId,
        properties: {
          Highlight: {
            rich_text: [{ type: 'text', text: { content: highlight } }]
          }
        }
      });
    } catch (error: any) {
      console.error(`Error in updateDailyLogHighlight for ${dateStr}:`, error);
      throw error;
    }
  }

  /**
   * Add a new Resource, mapping it to a PARA Area
   */
  public async addResource(title: string, url: string, areaId?: string): Promise<string> {
    try {
      const properties: any = {
        Name: { title: [{ text: { content: title } }] },
        URL: { url }
      };

      if (areaId) {
        properties.Area = { relation: [{ id: areaId }] };
      }

      const response = await this.notion.pages.create({
        parent: { database_id: config.RESOURCES_DB_ID },
        properties
      });

      return response.id;
    } catch (error: any) {
      console.error('Error in addResource:', error);
      throw error;
    }
  }

  /**
   * Fetch active PARA Areas to allow Gemini classification
   */
  public async fetchAreas(): Promise<NotionArea[]> {
    try {
      const response = await this.notion.databases.query({
        database_id: config.AREAS_DB_ID
      });

      return response.results.map((page: any) => {
        const name = page.properties.Name?.title?.[0]?.text?.content || 'Untitled Area';
        return {
          id: page.id,
          name
        };
      });
    } catch (error: any) {
      console.error('Error in fetchAreas:', error);
      throw error;
    }
  }
}
