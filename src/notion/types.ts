export interface TaskInput {
  name: string;
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
  projectName?: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  checklist: string[];
}
