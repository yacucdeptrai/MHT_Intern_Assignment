import type { StatusCategory, TaskPriority } from "../enums";
import type { AttachmentDto } from "./attachment";
import type { AuditLogRow } from "./audit";
import type { CommentThread } from "./comment";
import type { Page } from "./common";

export interface TaskAssigneeInfo {
  id: string;
  fullName: string;
  avatarKey?: string | null;
}

export interface TaskListItem {
  id: string;
  projectId: string;
  projectCode?: string;
  projectName?: string;
  number: number;
  title: string;
  priority: TaskPriority;
  statusId: string;
  statusName: string;
  statusCategory: StatusCategory;
  dueDate: string | null;
  startDate: string | null;
  assignees: TaskAssigneeInfo[];
  parentTaskId: string | null;
  sprintId: string | null;
  sprintName?: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  isTodayPriority: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

export interface StatusOption {
  id: string;
  name: string;
  category: StatusCategory;
  isDefault: boolean;
  canSelect?: boolean;
}

export interface MemberOption {
  id: string;
  fullName: string;
  email: string;
}

export interface SprintOption {
  id: string;
  name: string;
}

export interface ProjectTaskFilters {
  statusId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  sprintId?: string;
  page: number;
  pageSize: number;
}

export interface MyTaskFilters {
  projectId?: string;
  statusId?: string;
  priority?: TaskPriority;
  dueRange?: "all" | "overdue" | "today" | "week";
  page: number;
  pageSize: number;
}

export interface MyTasksLoaderData {
  tasks: Page<TaskListItem>;
  filters: MyTaskFilters;
  projects: ProjectOption[];
  statuses: StatusOption[];
}

export interface TaskDetailDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  number: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  statusId: string;
  statusName: string;
  statusCategory: StatusCategory;
  startDate: string | null;
  dueDate: string | null;
  sprintId: string | null;
  sprintName?: string | null;
  parentTaskId: string | null;
  parentTaskTitle?: string | null;
  parentTaskNumber?: number | null;
  createdById: string;
  creatorName: string;
  creatorAvatarKey?: string | null;
  assignees: TaskAssigneeInfo[];
  version: number;
  statusChangedAt: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  isOverdue: boolean;
  isDueSoon: boolean;
  isTodayPriority: boolean;
}

export interface TaskPermissions {
  canEdit: boolean;
  canArchive: boolean;
  canAssign: boolean;
  canApprove: boolean;
  canReopen: boolean;
  canComment: boolean;
  canAttach: boolean;
}

export interface TaskDetailLoaderData {
  task: TaskDetailDto;
  subTasks: TaskListItem[];
  comments: CommentThread[];
  attachments: AttachmentDto[];
  history: AuditLogRow[];
  members: MemberOption[];
  sprints: SprintOption[];
  statuses: StatusOption[];
  permissions: TaskPermissions;
}
