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
