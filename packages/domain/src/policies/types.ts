import type { ProjectRole, StatusCategory, SystemRole } from "../enums";

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
