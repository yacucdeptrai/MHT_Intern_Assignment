import type { StatusCategory, TaskPriority } from "../enums";

export type CalendarView = "day" | "week" | "month";

export interface CalendarRange {
  from: string;
  to: string;
}

export interface CalendarEvent {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  number: number;
  title: string;
  priority: TaskPriority;
  statusId: string;
  statusName: string;
  statusCategory: StatusCategory;
  startDate: string | null;
  dueDate: string;
  isSpan: boolean;
}

export interface CalendarProjectOption {
  id: string;
  code: string;
  name: string;
}

export interface CalendarLoaderData {
  view: CalendarView;
  date: string;
  range: CalendarRange;
  events: CalendarEvent[];
  projects: CalendarProjectOption[];
  selectedProjectId?: string;
}
