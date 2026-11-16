import type { ActorContext } from "./types";

export function canManageProject(actor: ActorContext, action: "create" | "update" | "archive"): boolean {
  if (actor.isProjectArchived) {
    return false;
  }
  if (action === "create") {
    return actor.systemRole === "ADMIN" || actor.systemRole === "PM";
  }
  return actor.systemRole === "ADMIN" || actor.projectRole === "PM";
}
