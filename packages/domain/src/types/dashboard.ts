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
}

export interface DashboardLoaderData {
  inProgress: TaskListItem[];
  todayPriorities: TaskListItem[];
  overdue: OverdueItem[];
  unreadCount: number;
}

export interface AdminDashboardLoaderData extends DashboardLoaderData {
  projectsAtRisk: ProjectRiskItem[];
}
