import type { ActorContext } from "./types";

export const canManageUsers = (actor: ActorContext): boolean => actor.systemRole === "ADMIN";

export const canManageStatuses = (actor: ActorContext): boolean => actor.systemRole === "ADMIN";
