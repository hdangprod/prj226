export interface TaskInput {
  name: string;
  description?: string;
  projectName?: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  checklist: string[];
}

export interface TaskPage {
  id: string;
  name: string;
  status: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  projectId?: string;
  dailyLogId?: string;
  checklistBlocks: ChecklistBlock[];
}

export interface ChecklistBlock {
  id: string;
  text: string;
  checked: boolean;
}

export interface DailyLogPage {
  id: string;
  title: string;
  highlight?: string;
}

export interface GeminiTaskOutput {
  name: string;
  description?: string;
  projectName?: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  checklist: string[];
}

/**
 * V2 Weekly Scheduler: Output schema from Gemini.
 * Each item has `properties` (Notion fields) and `content` (page body).
 */
export interface WeeklyTaskV2 {
  properties: {
    Name: string;
    Project?: string;
    Status: string;
    Priority: 'High' | 'Medium' | 'Low';
    Estimate: number;
    Date: {
      start: string; // ISO 8601
      end?: string;  // ISO 8601
    };
  };
  content: {
    Callout_Description: string;
    Checklist: string[];
  };
}

/**
 * Represents an existing Notion task that occupies a time slot.
 */
export interface NotionBusySlot {
  name: string;
  start: string; // ISO 8601
  estimate: number;
}
