import { describe, expect, it } from "vitest";

import { canManageUsers, canViewAuditLog } from "../src";

describe("canManageUsers policy", () => {
  it("allows system ADMIN to manage users", () => {
    expect(
      canManageUsers({
        userId: "admin-1",
        systemRole: "ADMIN",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(true);
  });

  it("denies PM, TEAM_LEAD, and MEMBER from managing users", () => {
    expect(
      canManageUsers({
        userId: "pm-1",
        systemRole: "PM",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);

    expect(
      canManageUsers({
        userId: "lead-1",
        systemRole: "TEAM_LEAD",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);

    expect(
      canManageUsers({
        userId: "member-1",
        systemRole: "MEMBER",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(false);
  });
});

describe("canViewAuditLog policy (FR-24)", () => {
  it("FR-24 c2: allows system ADMIN to view the system audit log", () => {
    expect(
      canViewAuditLog({
        userId: "admin-1",
        systemRole: "ADMIN",
        projectRole: null,
        isProjectArchived: false,
      }),
    ).toBe(true);
  });

  it("FR-24 c4: denies PM, TEAM_LEAD, and MEMBER from viewing the system audit log", () => {
    for (const systemRole of ["PM", "TEAM_LEAD", "MEMBER"] as const) {
      expect(
        canViewAuditLog({
          userId: `user-${systemRole.toLowerCase()}`,
          systemRole,
          projectRole: "PM",
          isProjectArchived: false,
        }),
      ).toBe(false);
    }
  });
});
