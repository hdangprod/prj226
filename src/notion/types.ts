export enum TaskStatus {
  NOT_STARTED = 'Not Started',
  ON_HOLD = 'On Hold',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  ARCHIVED = 'Archived',
}

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export interface TaskInput {
  name: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimate?: number;
  date?: string; // YYYY-MM-DD format
  checklist?: string[]; // Array of subtasks/to-dos
}

export interface NotionTask {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimate: number;
  date: string;
  projectId: string | null;
  dailyLogId: string | null;
}

export interface NotionProject {
  id: string;
  name: string;
  status: string;
  areaId: string | null;
}

export interface NotionDailyLog {
  id: string;
  name: string;
  date: string;
  highlight: string;
}

export interface NotionArea {
  id: string;
  name: string;
}

export interface NotionResource {
  id: string;
  name: string;
  url: string;
  areaId: string | null;
}
