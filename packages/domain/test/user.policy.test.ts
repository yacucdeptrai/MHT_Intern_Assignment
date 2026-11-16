import { describe, expect, it } from "vitest";

import { canManageUsers } from "../src";

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
