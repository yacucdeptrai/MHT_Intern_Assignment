import type { StatusCategory } from "./enums";
import { ForbiddenError, ValidationError } from "./errors";

export const TRANSITION_VIAS = ["UPDATE", "APPROVE", "REJECT", "REOPEN"] as const;
export type TransitionVia = (typeof TRANSITION_VIAS)[number];

export const WORKFLOW_ERROR_KEYS = [
  "errors.workflow_reopen_to_edit",
  "errors.workflow_only_approval_completes",
  "errors.workflow_only_review_approved",
  "errors.workflow_approve_to_done",
  "errors.workflow_only_review_rejected",
  "errors.workflow_reject_to_in_progress",
  "errors.workflow_only_completed_reopened",
  "errors.workflow_reopen_to_in_progress",
] as const;

export function assertTransitionAllowed(from: StatusCategory, to: StatusCategory, via: TransitionVia): void {
  if (via === "UPDATE") {
    if (from === "DONE") {
      throw new ForbiddenError("Reopen the task to edit it", { key: "errors.workflow_reopen_to_edit" });
    }
    if (to === "DONE") {
      throw new ForbiddenError("Only an approval can complete a task", {
        key: "errors.workflow_only_approval_completes",
      });
    }
    return;
  }

  if (via === "APPROVE") {
    if (from !== "REVIEW") {
      throw new ValidationError("Only tasks in review can be approved", {
        key: "errors.workflow_only_review_approved",
      });
    }
    if (to !== "DONE") {
      throw new ValidationError("Approval must transition to a DONE status", {
        key: "errors.workflow_approve_to_done",
      });
    }
    return;
  }

  if (via === "REJECT") {
    if (from !== "REVIEW") {
      throw new ValidationError("Only tasks in review can be rejected", {
        key: "errors.workflow_only_review_rejected",
      });
    }
    if (to !== "IN_PROGRESS") {
      throw new ValidationError("Rejection must transition to an IN_PROGRESS status", {
        key: "errors.workflow_reject_to_in_progress",
      });
    }
    return;
  }

  if (from !== "DONE") {
    throw new ValidationError("Only completed tasks can be reopened", {
      key: "errors.workflow_only_completed_reopened",
    });
  }
  if (to !== "IN_PROGRESS") {
    throw new ValidationError("Reopening must transition to an IN_PROGRESS status", {
      key: "errors.workflow_reopen_to_in_progress",
    });
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
