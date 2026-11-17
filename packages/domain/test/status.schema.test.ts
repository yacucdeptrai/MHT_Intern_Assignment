import { describe, expect, it } from "vitest";

import { canManageStatuses, StatusCreateSchema, StatusIdSchema, StatusReorderSchema, StatusUpdateSchema } from "../src";

describe("FR-20 c1: StatusCreateSchema", () => {
  it("accepts valid status name and category", () => {
    const parsed = StatusCreateSchema.safeParse({
      name: "To Do",
      category: "TODO",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("To Do");
      expect(parsed.data.category).toBe("TODO");
    }
  });

  it("trims whitespace from name", () => {
    const parsed = StatusCreateSchema.safeParse({
      name: "  In Progress  ",
      category: "IN_PROGRESS",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("In Progress");
    }
  });

  it("rejects empty name", () => {
    const parsed = StatusCreateSchema.safeParse({
      name: "   ",
      category: "TODO",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects name longer than 50 characters", () => {
    const parsed = StatusCreateSchema.safeParse({
      name: "A".repeat(51),
      category: "TODO",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid category", () => {
    const parsed = StatusCreateSchema.safeParse({
      name: "Testing",
      category: "INVALID",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("FR-20 c2: StatusUpdateSchema", () => {
  it("accepts valid update with statusId and partial fields", () => {
    const parsed = StatusUpdateSchema.safeParse({
      statusId: "status-uuid-1",
      name: "Done and Tested",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.statusId).toBe("status-uuid-1");
      expect(parsed.data.name).toBe("Done and Tested");
    }
  });

  it("rejects missing statusId", () => {
    const parsed = StatusUpdateSchema.safeParse({
      name: "New Name",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("FR-20 c2: StatusReorderSchema", () => {
  it("accepts array of ordered status IDs", () => {
    const parsed = StatusReorderSchema.safeParse({
      orderedIds: ["status-1", "status-2", "status-3"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.orderedIds).toEqual(["status-1", "status-2", "status-3"]);
    }
  });

  it("rejects non-array or empty orderedIds", () => {
    expect(StatusReorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(StatusReorderSchema.safeParse({ orderedIds: "status-1" }).success).toBe(false);
  });
});

describe("FR-20 c3/c2: StatusIdSchema", () => {
  it("accepts valid statusId", () => {
    const parsed = StatusIdSchema.safeParse({
      statusId: "status-uuid-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty statusId", () => {
    const parsed = StatusIdSchema.safeParse({
      statusId: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("FR-20 c5: canManageStatuses policy", () => {
  it("allows system ADMIN to manage statuses", () => {
    expect(
      canManageStatuses({
        userId: "admin-1",
        systemRole: "ADMIN",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(true);
  });

  it("denies PM, TEAM_LEAD, and MEMBER from managing statuses", () => {
    expect(
      canManageStatuses({
        userId: "pm-1",
        systemRole: "PM",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);

    expect(
      canManageStatuses({
        userId: "lead-1",
        systemRole: "TEAM_LEAD",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);

    expect(
      canManageStatuses({
        userId: "member-1",
        systemRole: "MEMBER",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);
  });
});
