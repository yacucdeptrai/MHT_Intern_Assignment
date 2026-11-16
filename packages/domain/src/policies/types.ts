import type { ProjectRole, StatusCategory, SystemRole } from "../enums";
import type { SessionUser } from "../types/user";

export interface ActorContext {
  userId: string;
  systemRole: SystemRole;
  projectRole: ProjectRole | null;
  isProjectArchived: boolean;
}

export interface TaskPolicyTarget {
  createdById: string;
  assigneeIds: readonly string[];
  category: StatusCategory;
}

export function toActor(
  user: Pick<SessionUser, "id" | "systemRole">,
  access?: { projectRole?: ProjectRole | null; isArchived?: boolean } | null,
): ActorContext {
  return {
    userId: user.id,
    systemRole: user.systemRole,
    projectRole: access?.projectRole ?? null,
    isProjectArchived: Boolean(access?.isArchived),
  };
}
