export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export interface SprintWithStatsDto {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  taskCount: number;
  completedCount: number;
  completionRate: number | null;
  createdAt: Date;
  updatedAt: Date;
}
