import type { ProjectRole } from "../enums";

export interface InviteDto {
  id: string;
  email: string;
  tokenHash: string;
  userId: string | null;
  projectId: string | null;
  projectRole: ProjectRole | null;
  invitedById: string;
  expiresAt: number;
  acceptedAt: number | null;
  createdAt: number;
}
