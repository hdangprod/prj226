export interface TaskInput {
  name: string;
  status?: 'Not Started' | 'On Hold' | 'In Progress' | 'Done' | 'Archived';
  priority: 'High' | 'Medium' | 'Low';
  estimate: number; // in hours
  dueDate: string;  // YYYY-MM-DD
  projectId?: string;
  dailyLogId?: string;
  checklist: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface NotionTask {
  id: string;
  name: string;
  status: 'Not Started' | 'On Hold' | 'In Progress' | 'Done' | 'Archived';
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  projectId?: string;
  dailyLogId?: string;
  checklist: ChecklistItem[];
}

export interface NotionProject {
  id: string;
  name: string;
  status: string;
  areaId?: string;
}

export interface NotionDailyLog {
  id: string;
  name: string; // YYYY-MM-DD
  date: string;
  highlight?: string;
}

export interface NotionArea {
  id: string;
  name: string;
}

export interface NotionResource {
  id: string;
  name: string;
  url: string;
  areaId?: string;
}
