import type { StatusCategory } from "../enums";
import { isTransitionAllowed } from "../workflow";
import type { ActorContext, TaskPolicyTarget } from "./types";

const isAdmin = (actor: ActorContext): boolean => actor.systemRole === "ADMIN";

const isProjectLead = (actor: ActorContext): boolean =>
  isAdmin(actor) || actor.projectRole === "PM" || actor.projectRole === "TEAM_LEAD";

export function canViewProject(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return isAdmin(actor);
  }
  return isAdmin(actor) || actor.projectRole !== null;
}

export function canManageProject(actor: ActorContext, action: "create" | "update" | "archive"): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  if (action === "create") {
    return actor.systemRole === "ADMIN" || actor.systemRole === "PM";
  }
  return isAdmin(actor) || actor.projectRole === "PM";
}

export function canManageMembers(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isAdmin(actor) || actor.projectRole === "PM";
}

export function canCreateTask(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return canViewProject(actor);
}

export function canEditTask(actor: ActorContext, task: TaskPolicyTarget): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  if (task.category === "DONE") {
    return false;
  }
  return isProjectLead(actor) || actor.userId === task.createdById || task.assigneeIds.includes(actor.userId);
}

export function canMoveTaskToCategory(
  actor: ActorContext,
  task: TaskPolicyTarget,
  toCategory: StatusCategory,
): boolean {
  return canEditTask(actor, task) && isTransitionAllowed(task.category, toCategory, "UPDATE");
}

export function canArchiveTask(actor: ActorContext, task: TaskPolicyTarget): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor) || actor.userId === task.createdById;
}

export function canAssignTask(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor);
}

export function canApproveTask(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor);
}

export function canReopenTask(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor);
}

export function canDeleteComment(actor: ActorContext, comment: { authorId: string }): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isAdmin(actor) || actor.projectRole === "PM" || actor.userId === comment.authorId;
}

export function canDeleteAttachment(actor: ActorContext, attachment: { uploadedById: string }): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isAdmin(actor) || actor.projectRole === "PM" || actor.userId === attachment.uploadedById;
}

export function canManageSprint(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor);
}

export function canViewMemberReport(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isProjectLead(actor);
}

export function canViewProjectReport(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isAdmin(actor) || actor.projectRole === "PM";
}

export function canExportProject(actor: ActorContext): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  return isAdmin(actor) || actor.projectRole === "PM";
}

export interface ProjectPermissions {
  canManageProject: boolean;
  canManageMembers: boolean;
  canManageSprint: boolean;
  canViewMemberReport: boolean;
  canViewProjectReport: boolean;
  canExportProject: boolean;
}

export function getProjectPermissions(actor: ActorContext): ProjectPermissions {
  return {
    canManageProject: canManageProject(actor, "update"),
    canManageMembers: canManageMembers(actor),
    canManageSprint: canManageSprint(actor),
    canViewMemberReport: canViewMemberReport(actor),
    canViewProjectReport: canViewProjectReport(actor),
    canExportProject: canExportProject(actor),
  };
}
