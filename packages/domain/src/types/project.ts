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

export interface ProjectSettingsDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  slackChannelId: string | null;
  isArchived: boolean;
}

export interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  avatarKey: string | null;
  projectRole: ProjectRole;
  createdAt: Date;
}

export interface InviteRow {
  id: string;
  email: string;
  projectRole: ProjectRole;
  createdAt: Date;
  expiresAt: Date;
}

export interface ProjectRiskItem {
  id: string;
  code: string;
  name: string;
  overdueCount: number;
  /** First project manager by name, when the project has one */
  pmName?: string | null;
}
