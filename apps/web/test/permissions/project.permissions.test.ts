import { beforeEach, describe, it } from "vitest";

import { userRepository } from "@pm/db";

import { exportService } from "../../app/services/export.service";
import { projectService } from "../../app/services/project/project.service";
import { projectMemberService } from "../../app/services/project/projectMember.service";
import { sprintService } from "../../app/services/project/sprint.service";
import { reportService } from "../../app/services/report.service";
import {
  assertPermission,
  setupPermissionFixture,
  type ExpectedPermission,
  type MatrixActor,
  type PermissionFixture,
} from "./helpers";

describe("Project Permission Matrix (docs/05 §3.2 & docs/09 §3.1)", () => {
  let fixture: PermissionFixture;

  beforeEach(async () => {
    fixture = await setupPermissionFixture();
  });

  const runMatrix = (
    actionName: string,
    cases: Array<[MatrixActor, ExpectedPermission]>,
    execute: (actor: MatrixActor) => Promise<unknown>,
  ) => {
    describe(actionName, () => {
      for (const [actor, expected] of cases) {
        it(`${actor} -> ${expected}`, async () => {
          await assertPermission(() => execute(actor), expected);
        });
      }
    });
  };

  runMatrix(
    "viewProject (getProjectHeader)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", "allow"],
      ["otherMember", "allow"],
      ["nonMember", 404],
    ],
    async (actor) => {
      await projectService.getProjectHeader(fixture.makeCtx(actor), fixture.projectId);
    },
  );

  runMatrix(
    "updateProjectSettings (updateProject)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", 403],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      await projectService.updateProject(fixture.makeCtx(actor), fixture.projectId, {
        name: `Updated by ${actor}`,
      });
    },
  );

  runMatrix(
    "archiveProject",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", 403],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      await projectService.archiveProject(fixture.makeCtx(actor), fixture.projectId);
    },
  );

  describe("manageMembers", () => {
    runMatrix(
      "addMember",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", 403],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        const dummyUser = await userRepository.insert(fixture.db, {
          id: crypto.randomUUID(),
          email: `candidate-${crypto.randomUUID().slice(0, 8)}@example.com`,
          fullName: "Candidate User",
          systemRole: "MEMBER",
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await projectMemberService.addMember(fixture.makeCtx(actor), fixture.projectId, {
          userId: dummyUser.id,
          projectRole: "MEMBER",
        });
      },
    );

    runMatrix(
      "removeMember",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", 403],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        // remove the otherMember
        await projectMemberService.removeMember(fixture.makeCtx(actor), fixture.projectId, {
          userId: fixture.actors.otherMember.id,
        });
      },
    );

    runMatrix(
      "changeRole",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", 403],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        await projectMemberService.changeRole(fixture.makeCtx(actor), fixture.projectId, {
          userId: fixture.actors.otherMember.id,
          projectRole: "TEAM_LEAD",
        });
      },
    );
  });

  describe("manageSprint", () => {
    runMatrix(
      "createSprint",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", "allow"],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        await sprintService.createSprint(fixture.makeCtx(actor), fixture.projectId, {
          name: `Sprint by ${actor}`,
          startDate: "2026-02-01",
          endDate: "2026-02-14",
        });
      },
    );

    runMatrix(
      "updateSprint",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", "allow"],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        const sprint = await sprintService.createSprint(fixture.makeCtx("projectPm"), fixture.projectId, {
          name: "Original Sprint",
          startDate: "2026-02-01",
          endDate: "2026-02-14",
        });
        await sprintService.updateSprint(fixture.makeCtx(actor), fixture.projectId, {
          sprintId: sprint.id,
          name: `Updated by ${actor}`,
          startDate: "2026-02-01",
          endDate: "2026-02-14",
        });
      },
    );

    runMatrix(
      "archiveSprint",
      [
        ["admin", "allow"],
        ["projectPm", "allow"],
        ["projectLead", "allow"],
        ["creator", 403],
        ["assignee", 403],
        ["otherMember", 403],
        ["nonMember", 404],
      ],
      async (actor) => {
        const sprint = await sprintService.createSprint(fixture.makeCtx("projectPm"), fixture.projectId, {
          name: "Sprint to archive",
          startDate: "2026-02-01",
          endDate: "2026-02-14",
        });
        await sprintService.archiveSprint(fixture.makeCtx(actor), fixture.projectId, {
          sprintId: sprint.id,
        });
      },
    );
  });

  runMatrix(
    "viewMemberReport",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      await reportService.getMemberReport(fixture.makeCtx(actor), fixture.projectId, {});
    },
  );

  runMatrix(
    "viewProjectReport",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", 403],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      await reportService.getProjectReport(fixture.makeCtx(actor), fixture.projectId);
    },
  );

  runMatrix(
    "exportProject",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", 403],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      await exportService.exportTasks(fixture.makeCtx(actor), fixture.projectId, "csv");
    },
  );
});
