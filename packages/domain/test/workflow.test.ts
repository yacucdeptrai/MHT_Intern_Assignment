import { describe, expect, it } from "vitest";

import type { ActorContext, StatusCategory, TaskPolicyTarget } from "../src";
import {
  assertTransitionAllowed,
  canMoveTaskToCategory,
  ForbiddenError,
  isTransitionAllowed,
  SlackUpdateThreadPayloadSchema,
  TaskApproveSchema,
  TaskStatusChangeSchema,
  ValidationError,
} from "../src";

describe("Workflow Transitions (docs/05 §6.2, FR-21..FR-23)", () => {
  const nonDoneCategories: readonly StatusCategory[] = ["TODO", "IN_PROGRESS", "REVIEW"];
  const allCategories: readonly StatusCategory[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

  describe("Row 1: TODO / IN_PROGRESS / REVIEW -> TODO / IN_PROGRESS / REVIEW via UPDATE", () => {
    const allowedPairs = nonDoneCategories.flatMap((from) =>
      nonDoneCategories.map((to) => [from, to] as [StatusCategory, StatusCategory]),
    );

    it.each(allowedPairs)("FR-21 c1: allows moving from %s to %s via UPDATE (including same category)", (from, to) => {
      expect(() => {
        assertTransitionAllowed(from, to, "UPDATE");
      }).not.toThrow();
      expect(isTransitionAllowed(from, to, "UPDATE")).toBe(true);
    });
  });

  describe("Row 2: TODO / IN_PROGRESS / REVIEW -> DONE via UPDATE", () => {
    it.each(nonDoneCategories)(
      "FR-21 c2: rejects moving from %s to DONE via UPDATE with 403 'Only an approval can complete a task'",
      (from) => {
        expect(() => {
          assertTransitionAllowed(from, "DONE", "UPDATE");
        }).toThrow(ForbiddenError);
        expect(() => {
          assertTransitionAllowed(from, "DONE", "UPDATE");
        }).toThrow("Only an approval can complete a task");
        expect(isTransitionAllowed(from, "DONE", "UPDATE")).toBe(false);
      },
    );
  });

  describe("Row 3: REVIEW -> DONE via APPROVE", () => {
    it("FR-22 c1: allows moving from REVIEW to DONE via APPROVE", () => {
      expect(() => {
        assertTransitionAllowed("REVIEW", "DONE", "APPROVE");
      }).not.toThrow();
      expect(isTransitionAllowed("REVIEW", "DONE", "APPROVE")).toBe(true);
    });

    it.each(nonDoneCategories)(
      "FR-22 c1: rejects APPROVE from REVIEW to non-DONE target %s with 400 ValidationError",
      (to) => {
        expect(() => {
          assertTransitionAllowed("REVIEW", to, "APPROVE");
        }).toThrow(ValidationError);
        expect(isTransitionAllowed("REVIEW", to, "APPROVE")).toBe(false);
      },
    );
  });

  describe("Row 4: REVIEW -> IN_PROGRESS via REJECT", () => {
    it("FR-23 c1: allows moving from REVIEW to IN_PROGRESS via REJECT", () => {
      expect(() => {
        assertTransitionAllowed("REVIEW", "IN_PROGRESS", "REJECT");
      }).not.toThrow();
      expect(isTransitionAllowed("REVIEW", "IN_PROGRESS", "REJECT")).toBe(true);
    });

    it.each(["TODO", "REVIEW", "DONE"] as const)(
      "FR-23 c1: rejects REJECT from REVIEW to non-IN_PROGRESS target %s with 400 ValidationError",
      (to) => {
        expect(() => {
          assertTransitionAllowed("REVIEW", to, "REJECT");
        }).toThrow(ValidationError);
        expect(isTransitionAllowed("REVIEW", to, "REJECT")).toBe(false);
      },
    );
  });

  describe("Row 5: DONE -> IN_PROGRESS via REOPEN", () => {
    it("FR-23 c3: allows moving from DONE to IN_PROGRESS via REOPEN", () => {
      expect(() => {
        assertTransitionAllowed("DONE", "IN_PROGRESS", "REOPEN");
      }).not.toThrow();
      expect(isTransitionAllowed("DONE", "IN_PROGRESS", "REOPEN")).toBe(true);
    });

    it.each(["TODO", "REVIEW", "DONE"] as const)(
      "FR-23 c3: rejects REOPEN from DONE to non-IN_PROGRESS target %s with 400 ValidationError",
      (to) => {
        expect(() => {
          assertTransitionAllowed("DONE", to, "REOPEN");
        }).toThrow(ValidationError);
        expect(isTransitionAllowed("DONE", to, "REOPEN")).toBe(false);
      },
    );

    it.each(nonDoneCategories)("FR-23 c3: rejects REOPEN from non-DONE source %s with 400 ValidationError", (from) => {
      expect(() => {
        assertTransitionAllowed(from, "IN_PROGRESS", "REOPEN");
      }).toThrow(ValidationError);
      expect(() => {
        assertTransitionAllowed(from, "IN_PROGRESS", "REOPEN");
      }).toThrow("Only completed tasks can be reopened");
      expect(isTransitionAllowed(from, "IN_PROGRESS", "REOPEN")).toBe(false);
    });
  });

  describe("Row 6: DONE -> anything via UPDATE", () => {
    it.each(allCategories)(
      "FR-21 c3: rejects moving from DONE to %s via UPDATE with 403 'Reopen the task to edit it'",
      (to) => {
        expect(() => {
          assertTransitionAllowed("DONE", to, "UPDATE");
        }).toThrow(ForbiddenError);
        expect(() => {
          assertTransitionAllowed("DONE", to, "UPDATE");
        }).toThrow("Reopen the task to edit it");
        expect(isTransitionAllowed("DONE", to, "UPDATE")).toBe(false);
      },
    );
  });

  describe("Row 7: non-REVIEW (TODO / IN_PROGRESS / DONE) -> anything via APPROVE / REJECT", () => {
    const nonReviewSources: readonly StatusCategory[] = ["TODO", "IN_PROGRESS", "DONE"];

    it.each(nonReviewSources)(
      "FR-22 c2: rejects APPROVE from %s with 400 'Only tasks in review can be approved'",
      (from) => {
        for (const to of allCategories) {
          expect(() => {
            assertTransitionAllowed(from, to, "APPROVE");
          }).toThrow(ValidationError);
          expect(() => {
            assertTransitionAllowed(from, to, "APPROVE");
          }).toThrow("Only tasks in review can be approved");
          expect(isTransitionAllowed(from, to, "APPROVE")).toBe(false);
        }
      },
    );

    it.each(nonReviewSources)(
      "FR-23 c1: rejects REJECT from %s with 400 'Only tasks in review can be rejected'",
      (from) => {
        for (const to of allCategories) {
          expect(() => {
            assertTransitionAllowed(from, to, "REJECT");
          }).toThrow(ValidationError);
          expect(() => {
            assertTransitionAllowed(from, to, "REJECT");
          }).toThrow("Only tasks in review can be rejected");
          expect(isTransitionAllowed(from, to, "REJECT")).toBe(false);
        }
      },
    );
  });
});

describe("canMoveTaskToCategory domain policy (FR-21 c1..c4)", () => {
  const leadActor: ActorContext = {
    userId: "lead-1",
    systemRole: "MEMBER",
    projectRole: "TEAM_LEAD",
    isProjectArchived: false,
  };
  const assigneeActor: ActorContext = {
    userId: "assignee-1",
    systemRole: "MEMBER",
    projectRole: "MEMBER",
    isProjectArchived: false,
  };
  const otherMemberActor: ActorContext = {
    userId: "other-1",
    systemRole: "MEMBER",
    projectRole: "MEMBER",
    isProjectArchived: false,
  };

  const activeTask: TaskPolicyTarget = {
    createdById: "creator-1",
    assigneeIds: ["assignee-1"],
    category: "TODO",
  };

  it("FR-21 c1: allows task editors (lead, creator, assignee) to move between TODO, IN_PROGRESS, and REVIEW", () => {
    expect(canMoveTaskToCategory(leadActor, activeTask, "IN_PROGRESS")).toBe(true);
    expect(canMoveTaskToCategory(assigneeActor, activeTask, "REVIEW")).toBe(true);
    expect(canMoveTaskToCategory(assigneeActor, activeTask, "TODO")).toBe(true);
  });

  it("FR-21 c2: denies all editors from moving to DONE via update", () => {
    expect(canMoveTaskToCategory(leadActor, activeTask, "DONE")).toBe(false);
    expect(canMoveTaskToCategory(assigneeActor, activeTask, "DONE")).toBe(false);
  });

  it("FR-21 c3: denies moving a DONE task to any category via update", () => {
    const doneTask: TaskPolicyTarget = { ...activeTask, category: "DONE" };
    expect(canMoveTaskToCategory(leadActor, doneTask, "IN_PROGRESS")).toBe(false);
    expect(canMoveTaskToCategory(assigneeActor, doneTask, "TODO")).toBe(false);
  });

  it("FR-21 c4: denies non-editor project member from moving task to any category", () => {
    expect(canMoveTaskToCategory(otherMemberActor, activeTask, "IN_PROGRESS")).toBe(false);
  });

  it("FR-09 c4: denies moving task when project is archived", () => {
    expect(canMoveTaskToCategory({ ...leadActor, isProjectArchived: true }, activeTask, "IN_PROGRESS")).toBe(false);
  });
});

describe("TaskStatusChangeSchema & SlackUpdateThreadPayloadSchema", () => {
  it("FR-21 c1: parses valid statusId and positive integer version", () => {
    const parsed = TaskStatusChangeSchema.safeParse({ statusId: "status-1", version: "3" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ statusId: "status-1", version: 3 });
    }
  });

  it("rejects empty statusId or invalid version", () => {
    expect(TaskStatusChangeSchema.safeParse({ statusId: "  ", version: "1" }).success).toBe(false);
    expect(TaskStatusChangeSchema.safeParse({ statusId: "status-1", version: "0" }).success).toBe(false);
  });

  it("parses SLACK_UPDATE_THREAD payload per docs/07 §1.4", () => {
    const parsed = SlackUpdateThreadPayloadSchema.safeParse({
      taskId: "t-1",
      fromStatusId: "s-1",
      toStatusId: "s-2",
      actorId: "u-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("FR-22 c1: TaskApproveSchema parses positive integer version and rejects invalid versions", () => {
    expect(TaskApproveSchema.safeParse({ version: "2" })).toEqual({
      success: true,
      data: { version: 2 },
    });
    expect(TaskApproveSchema.safeParse({ version: "0" }).success).toBe(false);
    expect(TaskApproveSchema.safeParse({}).success).toBe(false);
  });
});
