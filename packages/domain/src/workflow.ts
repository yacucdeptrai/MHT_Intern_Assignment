import type { StatusCategory } from "./enums";
import { ForbiddenError, ValidationError } from "./errors";

export const TRANSITION_VIAS = ["UPDATE", "APPROVE", "REJECT", "REOPEN"] as const;
export type TransitionVia = (typeof TRANSITION_VIAS)[number];

export function assertTransitionAllowed(from: StatusCategory, to: StatusCategory, via: TransitionVia): void {
  if (via === "UPDATE") {
    if (from === "DONE") {
      throw new ForbiddenError("Reopen the task to edit it");
    }
    if (to === "DONE") {
      throw new ForbiddenError("Only an approval can complete a task");
    }
    return;
  }

  if (via === "APPROVE") {
    if (from !== "REVIEW") {
      throw new ValidationError("Only tasks in review can be approved");
    }
    if (to !== "DONE") {
      throw new ValidationError("Approval must transition to a DONE status");
    }
    return;
  }

  if (via === "REJECT") {
    if (from !== "REVIEW") {
      throw new ValidationError("Only tasks in review can be rejected");
    }
    if (to !== "IN_PROGRESS") {
      throw new ValidationError("Rejection must transition to an IN_PROGRESS status");
    }
    return;
  }

  if (from !== "DONE") {
    throw new ValidationError("Only completed tasks can be reopened");
  }
  if (to !== "IN_PROGRESS") {
    throw new ValidationError("Reopening must transition to an IN_PROGRESS status");
  }
}

export function isTransitionAllowed(from: StatusCategory, to: StatusCategory, via: TransitionVia): boolean {
  try {
    assertTransitionAllowed(from, to, via);
    return true;
  } catch {
    return false;
  }
}
