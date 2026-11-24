import type { StatusCategory, TaskPriority } from "../enums";
import type { ProjectRiskItem } from "./project";
import type { TaskListItem } from "./task";

export interface OverdueItem {
  id: string;
  projectId: string;
  projectCode?: string;
  projectName?: string;
  number: number;
  title: string;
  dueDate: string;
  daysOverdue: number;
  priority?: TaskPriority;
  statusName?: string;
  statusCategory?: StatusCategory;
}

export interface DashboardLoaderData {
  inProgress: TaskListItem[];
  /** Your open tasks waiting in a REVIEW-category status */
  inReview: TaskListItem[];
  todayPriorities: TaskListItem[];
  overdue: OverdueItem[];
  unreadCount: number;
}

export interface AdminDashboardLoaderData extends DashboardLoaderData {
  projectsAtRisk: ProjectRiskItem[];
}
