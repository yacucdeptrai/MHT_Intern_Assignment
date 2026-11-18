import type { SprintWithStatsDto } from "./sprint";

export interface MemberReportRow {
  userId: string;
  fullName: string;
  email: string;
  avatarKey: string | null;
  projectRole: string;
  todoCount: number;
  inProgressCount: number;
  reviewCount: number;
  doneCount: number;
  totalAssigned: number;
  overdueCount: number;
  completedInRangeCount: number;
}

export interface StatusDistributionItem {
  statusId: string;
  statusName: string;
  category: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  position: number;
  taskCount: number;
  percentage: number;
}

export interface StaleReviewAssignee {
  id: string;
  fullName: string;
  email: string;
  avatarKey: string | null;
}

export interface StaleReviewItem {
  taskId: string;
  taskNumber: number;
  title: string;
  statusId: string;
  statusName: string;
  statusChangedAt: Date;
  daysInReview: number;
  assignees: StaleReviewAssignee[];
}

export interface OverdueByStatusItem {
  statusId: string;
  statusName: string;
  category: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  overdueCount: number;
}

export interface ProjectReportDto {
  totalTasks: number;
  doneTasks: number;
  completionRate: number;
  statusDistribution: StatusDistributionItem[];
  sprintCompletion: SprintWithStatsDto[];
  bottlenecks: {
    staleReviews: StaleReviewItem[];
    overdueByStatus: OverdueByStatusItem[];
  };
}
