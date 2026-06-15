import { NotionSecondBrainClient } from '../notion/client';
import { geminiAssistant } from '../gemini/client';
import { NotionTask, ChecklistItem } from '../notion/types';

export class TaskService {
  private notionClient: NotionSecondBrainClient;

  constructor() {
    this.notionClient = new NotionSecondBrainClient();
  }

  /**
   * Parse natural language command, resolve Daily Log & Project, and create Task with checklist in Notion
   */
  public async createTaskFromNaturalLanguage(rawInput: string): Promise<{
    taskName: string;
    projectName: string;
    priority: string;
    estimate: number;
    dueDate: string;
    checklistCount: number;
    checklistText: string;
  }> {
    // 1. Fetch active projects to map relation
    const projects = await this.notionClient.fetchActiveProjects();

    // 2. Parse using Gemini
    const parsed = await geminiAssistant.parseTaskInput(rawInput, projects);

    // 3. Find or create the Daily Log for the task's due date
    const dailyLogId = await this.notionClient.findOrCreateDailyLog(parsed.dueDate);

    // 4. Create the Task in Notion
    const taskId = await this.notionClient.addTask(
      {
        name: parsed.name,
        status: 'Not Started',
        priority: parsed.priority,
        estimate: parsed.estimate,
        dueDate: parsed.dueDate,
        checklist: parsed.checklist
      },
      parsed.projectId || undefined,
      dailyLogId
    );

    const matchedProject = projects.find(p => p.id === parsed.projectId);
    const projectName = matchedProject ? matchedProject.name : 'None';

    return {
      taskName: parsed.name,
      projectName,
      priority: parsed.priority,
      estimate: parsed.estimate,
      dueDate: parsed.dueDate,
      checklistCount: parsed.checklist.length,
      checklistText: parsed.checklist.map(item => `- [ ] ${item}`).join('\n')
    };
  }

  /**
   * Handles Task deferral (FR-3):
   * Audits task blocks, halves original estimate, marks original Done, and clones tomorrow with unchecked items.
   */
  public async deferAndRolloverTask(taskId: string): Promise<{
    originalTask: NotionTask;
    adjustedOriginalEstimate: number;
    checkedCount: number;
    uncheckedCount: number;
    tomorrowStr: string;
    clonedTaskId: string;
  }> {
    // 1. Retrieve original task and audit checklist children blocks
    const task = await this.notionClient.getTaskWithChecklist(taskId);

    const uncheckedItems = task.checklist.filter(item => !item.checked);
    const checkedCount = task.checklist.length - uncheckedItems.length;

    // 2. Calibrate original estimate downward by 50%
    const adjustedOriginalEstimate = parseFloat((task.estimate * 0.5).toFixed(2)) || 0.1;
    await this.notionClient.updateTaskEstimate(taskId, adjustedOriginalEstimate);

    // 3. Mark original task as Done
    await this.notionClient.completeTask(taskId);

    // 4. Calculate tomorrow's date string in timezone
    const taskDate = task.dueDate ? new Date(task.dueDate) : new Date();
    taskDate.setDate(taskDate.getDate() + 1);
    const tomorrowStr = this.notionClient.getLocalDateString(taskDate);

    // 5. Clone the task for tomorrow with unchecked items (inherits original estimate * 0.5)
    const clonedTaskId = await this.notionClient.cloneTaskForTomorrow(
      task,
      uncheckedItems,
      adjustedOriginalEstimate
    );

    return {
      originalTask: task,
      adjustedOriginalEstimate,
      checkedCount,
      uncheckedCount: uncheckedItems.length,
      tomorrowStr,
      clonedTaskId
    };
  }

  /**
   * Focus Rescue Engine (FR-4):
   * Find exactly one high-priority task with low execution friction (<= 30 minutes)
   */
  public async rescueTask(): Promise<NotionTask | null> {
    const todayTasks = await this.notionClient.fetchTodayTasks();

    // Filter: Priority is High AND Estimate is <= 0.5 hours (30 minutes)
    const candidateTasks = todayTasks.filter(
      task => task.priority === 'High' && task.estimate <= 0.5
    );

    if (candidateTasks.length === 0) {
      return null;
    }

    // Pick the first candidate task
    return candidateTasks[0];
  }

  /**
   * Capture Resource (FR-1/FR-5 Resource Flow):
   * Saves a link/document, uses Gemini to suggest title and Area, creates Resource page in Notion.
   */
  public async saveResource(url: string, rawInput: string): Promise<{
    title: string;
    url: string;
    areaName: string;
  }> {
    const areas = await this.notionClient.fetchAreas();

    // Clean title from prompt (remove URL or generate title based on input context)
    const cleanTitle = rawInput.replace(url, '').trim() || 'Reference Document';

    // Gemini classifies resource to an Area
    const matchedAreaId = await geminiAssistant.classifyResource(cleanTitle, url, areas);

    const matchedArea = areas.find(a => a.id === matchedAreaId);
    const areaName = matchedArea ? matchedArea.name : 'General References';

    await this.notionClient.addResource(cleanTitle, url, matchedAreaId || undefined);

    return {
      title: cleanTitle,
      url,
      areaName
    };
  }

  /**
   * Update Daily Log Highlight text (Translates prompt and updates log)
   */
  public async addDailyHighlight(text: string): Promise<string> {
    const todayStr = this.notionClient.getLocalDateString();
    
    // Translate text to English via Gemini
    const translated = await geminiAssistant.translateHighlight(text);

    // Save to Notion Daily Log
    await this.notionClient.updateDailyLogHighlight(todayStr, translated);

    return translated;
  }
}

export const taskService = new TaskService();
