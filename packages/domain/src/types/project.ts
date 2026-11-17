import type { ProjectRole, ProjectStatus } from "../enums";

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  projectRole?: ProjectRole | null;
  memberCount?: number;
}

export interface ProjectHeaderDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectRole: ProjectRole;
  isArchived: boolean;
}
