import { describe, expect, it } from "vitest";

import { canManageProject, toActor } from "../src";

describe("canManageProject policy", () => {
  it("FR-07 c1: allows system ADMIN and PM to create project", () => {
    expect(
      canManageProject(
        {
          userId: "admin-1",
          systemRole: "ADMIN",
          projectRole: null,
          isProjectArchived: false,
        },
        "create",
      ),
    ).toBe(true);

    expect(
      canManageProject(
        {
          userId: "pm-1",
          systemRole: "PM",
          projectRole: null,
          isProjectArchived: false,
        },
        "create",
      ),
    ).toBe(true);
  });

  it("FR-07 c4: denies system TEAM_LEAD and MEMBER from creating project", () => {
    expect(
      canManageProject(
        {
          userId: "lead-1",
          systemRole: "TEAM_LEAD",
          projectRole: null,
          isProjectArchived: false,
        },
        "create",
      ),
    ).toBe(false);

    expect(
      canManageProject(
        {
          userId: "member-1",
          systemRole: "MEMBER",
          projectRole: null,
          isProjectArchived: false,
        },
        "create",
      ),
    ).toBe(false);
  });

  it("denies all actions on archived project including for Admin", () => {
    expect(
      canManageProject(
        {
          userId: "admin-1",
          systemRole: "ADMIN",
          projectRole: "PM",
          isProjectArchived: true,
        },
        "create",
      ),
    ).toBe(false);

    expect(
      canManageProject(
        {
          userId: "admin-1",
          systemRole: "ADMIN",
          projectRole: "PM",
          isProjectArchived: true,
        },
        "update",
      ),
    ).toBe(false);
  });
});

describe("toActor helper", () => {
  it("builds ActorContext from SessionUser and project access", () => {
    const actor = toActor(
      {
        id: "u-1",
        systemRole: "PM",
      },
      {
        projectRole: "MEMBER",
        isArchived: false,
      },
    );

    expect(actor).toEqual({
      userId: "u-1",
      systemRole: "PM",
      projectRole: "MEMBER",
      isProjectArchived: false,
    });
  });

  it("handles null project access", () => {
    const actor = toActor({
      id: "u-2",
      systemRole: "ADMIN",
    });

    expect(actor).toEqual({
      userId: "u-2",
      systemRole: "ADMIN",
      projectRole: null,
      isProjectArchived: false,
    });
  });
});
