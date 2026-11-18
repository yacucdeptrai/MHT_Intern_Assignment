import { describe, expect, it } from "vitest";

import type { ActorContext, TaskPolicyTarget } from "../src";
import {
  canApproveTask,
  canArchiveTask,
  canAssignTask,
  canCreateComment,
  canCreateTask,
  canDeleteAttachment,
  canDeleteComment,
  canEditTask,
  canExportProject,
  canManageMembers,
  canManageProject,
  canManageSprint,
  canReopenTask,
  canViewMemberReport,
  canViewProject,
  canViewProjectReport,
  getProjectPermissions,
  toActor,
} from "../src";

describe("Project Permission Matrix (docs/05 §3.2)", () => {
  const adminActor: ActorContext = {
    userId: "admin-1",
    systemRole: "ADMIN",
    projectRole: "PM",
    isProjectArchived: false,
  };

  const projectPmActor: ActorContext = {
    userId: "pm-1",
    systemRole: "MEMBER",
    projectRole: "PM",
    isProjectArchived: false,
  };

  const teamLeadActor: ActorContext = {
    userId: "lead-1",
    systemRole: "MEMBER",
    projectRole: "TEAM_LEAD",
    isProjectArchived: false,
  };

  const creatorActor: ActorContext = {
    userId: "creator-1",
    systemRole: "MEMBER",
    projectRole: "MEMBER",
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

  const nonMemberActor: ActorContext = {
    userId: "non-member-1",
    systemRole: "MEMBER",
    projectRole: null,
    isProjectArchived: false,
  };

  const standardTask: TaskPolicyTarget = {
    createdById: creatorActor.userId,
    assigneeIds: [assigneeActor.userId],
    category: "TODO",
  };

  describe("canViewProject (FR-16, FR-24)", () => {
    it("allows Admin, PM, Team Lead, and all project Members", () => {
      expect(canViewProject(adminActor)).toBe(true);
      expect(canViewProject(projectPmActor)).toBe(true);
      expect(canViewProject(teamLeadActor)).toBe(true);
      expect(canViewProject(creatorActor)).toBe(true);
      expect(canViewProject(assigneeActor)).toBe(true);
      expect(canViewProject(otherMemberActor)).toBe(true);
    });

    it("denies non-member", () => {
      expect(canViewProject(nonMemberActor)).toBe(false);
    });

    it("allows Admin to view archived project", () => {
      const archivedAdmin: ActorContext = { ...adminActor, isProjectArchived: true };
      expect(canViewProject(archivedAdmin)).toBe(true);
    });

    it("denies non-admin to view archived project", () => {
      const archivedMember: ActorContext = { ...projectPmActor, isProjectArchived: true };
      expect(canViewProject(archivedMember)).toBe(false);
    });
  });

  describe("canManageProject (FR-08, FR-09)", () => {
    it("allows Admin and PM to update / archive project", () => {
      expect(canManageProject(adminActor, "update")).toBe(true);
      expect(canManageProject(adminActor, "archive")).toBe(true);
      expect(canManageProject(projectPmActor, "update")).toBe(true);
      expect(canManageProject(projectPmActor, "archive")).toBe(true);
    });

    it("denies Team Lead and Members from update / archive", () => {
      expect(canManageProject(teamLeadActor, "update")).toBe(false);
      expect(canManageProject(creatorActor, "update")).toBe(false);
      expect(canManageProject(assigneeActor, "update")).toBe(false);
      expect(canManageProject(otherMemberActor, "update")).toBe(false);
      expect(canManageProject(nonMemberActor, "update")).toBe(false);
    });

    it("denies all modifications when project is archived, even for Admin", () => {
      const archivedAdmin: ActorContext = { ...adminActor, isProjectArchived: true };
      expect(canManageProject(archivedAdmin, "update")).toBe(false);
      expect(canManageProject(archivedAdmin, "archive")).toBe(false);
    });
  });

  describe("canManageMembers (FR-10, FR-11, FR-37)", () => {
    it("allows Admin and Project PM", () => {
      expect(canManageMembers(adminActor)).toBe(true);
      expect(canManageMembers(projectPmActor)).toBe(true);
    });

    it("denies Team Lead, Members, and non-members", () => {
      expect(canManageMembers(teamLeadActor)).toBe(false);
      expect(canManageMembers(creatorActor)).toBe(false);
      expect(canManageMembers(assigneeActor)).toBe(false);
      expect(canManageMembers(otherMemberActor)).toBe(false);
      expect(canManageMembers(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canManageMembers({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canCreateTask (FR-12, FR-17)", () => {
    it("allows Admin, PM, Team Lead, and all project Members", () => {
      expect(canCreateTask(adminActor)).toBe(true);
      expect(canCreateTask(projectPmActor)).toBe(true);
      expect(canCreateTask(teamLeadActor)).toBe(true);
      expect(canCreateTask(creatorActor)).toBe(true);
      expect(canCreateTask(assigneeActor)).toBe(true);
      expect(canCreateTask(otherMemberActor)).toBe(true);
    });

    it("denies non-member", () => {
      expect(canCreateTask(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canCreateTask({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canEditTask (FR-13, FR-21)", () => {
    it("allows Admin, PM, Team Lead, Creator, and Assignee on active task", () => {
      expect(canEditTask(adminActor, standardTask)).toBe(true);
      expect(canEditTask(projectPmActor, standardTask)).toBe(true);
      expect(canEditTask(teamLeadActor, standardTask)).toBe(true);
      expect(canEditTask(creatorActor, standardTask)).toBe(true);
      expect(canEditTask(assigneeActor, standardTask)).toBe(true);
    });

    it("denies other project member and non-member", () => {
      expect(canEditTask(otherMemberActor, standardTask)).toBe(false);
      expect(canEditTask(nonMemberActor, standardTask)).toBe(false);
    });

    it("denies everyone including Admin when task is in DONE category", () => {
      const doneTask: TaskPolicyTarget = { ...standardTask, category: "DONE" };
      expect(canEditTask(adminActor, doneTask)).toBe(false);
      expect(canEditTask(projectPmActor, doneTask)).toBe(false);
      expect(canEditTask(teamLeadActor, doneTask)).toBe(false);
      expect(canEditTask(creatorActor, doneTask)).toBe(false);
      expect(canEditTask(assigneeActor, doneTask)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canEditTask({ ...adminActor, isProjectArchived: true }, standardTask)).toBe(false);
    });
  });

  describe("canArchiveTask (FR-14)", () => {
    it("allows Admin, PM, Team Lead, and Creator", () => {
      expect(canArchiveTask(adminActor, standardTask)).toBe(true);
      expect(canArchiveTask(projectPmActor, standardTask)).toBe(true);
      expect(canArchiveTask(teamLeadActor, standardTask)).toBe(true);
      expect(canArchiveTask(creatorActor, standardTask)).toBe(true);
    });

    it("denies Assignee, Other Member, and Non-Member", () => {
      expect(canArchiveTask(assigneeActor, standardTask)).toBe(false);
      expect(canArchiveTask(otherMemberActor, standardTask)).toBe(false);
      expect(canArchiveTask(nonMemberActor, standardTask)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canArchiveTask({ ...adminActor, isProjectArchived: true }, standardTask)).toBe(false);
    });
  });

  describe("canAssignTask (FR-15)", () => {
    it("allows Admin, PM, and Team Lead", () => {
      expect(canAssignTask(adminActor)).toBe(true);
      expect(canAssignTask(projectPmActor)).toBe(true);
      expect(canAssignTask(teamLeadActor)).toBe(true);
    });

    it("denies Creator, Assignee, Other Member, and Non-Member", () => {
      expect(canAssignTask(creatorActor)).toBe(false);
      expect(canAssignTask(assigneeActor)).toBe(false);
      expect(canAssignTask(otherMemberActor)).toBe(false);
      expect(canAssignTask(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canAssignTask({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canApproveTask (FR-22, FR-23)", () => {
    it("allows Admin, PM, and Team Lead", () => {
      expect(canApproveTask(adminActor)).toBe(true);
      expect(canApproveTask(projectPmActor)).toBe(true);
      expect(canApproveTask(teamLeadActor)).toBe(true);
    });

    it("denies Members and Non-Members", () => {
      expect(canApproveTask(creatorActor)).toBe(false);
      expect(canApproveTask(assigneeActor)).toBe(false);
      expect(canApproveTask(otherMemberActor)).toBe(false);
      expect(canApproveTask(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canApproveTask({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canReopenTask (FR-23)", () => {
    it("allows Admin, PM, and Team Lead", () => {
      expect(canReopenTask(adminActor)).toBe(true);
      expect(canReopenTask(projectPmActor)).toBe(true);
      expect(canReopenTask(teamLeadActor)).toBe(true);
    });

    it("denies Members and Non-Members", () => {
      expect(canReopenTask(creatorActor)).toBe(false);
      expect(canReopenTask(assigneeActor)).toBe(false);
      expect(canReopenTask(otherMemberActor)).toBe(false);
      expect(canReopenTask(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canReopenTask({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canCreateComment (FR-19, FR-09 c4)", () => {
    it("FR-19 c1: allows Admin, PM, Team Lead, Creator, Assignee, and Other Member", () => {
      expect(canCreateComment(adminActor)).toBe(true);
      expect(canCreateComment(projectPmActor)).toBe(true);
      expect(canCreateComment(teamLeadActor)).toBe(true);
      expect(canCreateComment(creatorActor)).toBe(true);
      expect(canCreateComment(assigneeActor)).toBe(true);
      expect(canCreateComment(otherMemberActor)).toBe(true);
    });

    it("denies Non-Member", () => {
      expect(canCreateComment(nonMemberActor)).toBe(false);
    });

    it("FR-09 c4: denies when project is archived (including Admin)", () => {
      expect(canCreateComment({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canDeleteComment (FR-19)", () => {
    const comment = { authorId: creatorActor.userId };

    it("allows Admin, PM, and author", () => {
      expect(canDeleteComment(adminActor, comment)).toBe(true);
      expect(canDeleteComment(projectPmActor, comment)).toBe(true);
      expect(canDeleteComment(creatorActor, comment)).toBe(true);
    });

    it("denies Team Lead (non-author), other member, and non-member", () => {
      expect(canDeleteComment(teamLeadActor, comment)).toBe(false);
      expect(canDeleteComment(assigneeActor, comment)).toBe(false);
      expect(canDeleteComment(otherMemberActor, comment)).toBe(false);
      expect(canDeleteComment(nonMemberActor, comment)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canDeleteComment({ ...adminActor, isProjectArchived: true }, comment)).toBe(false);
    });
  });

  describe("canDeleteAttachment (FR-18)", () => {
    const attachment = { uploadedById: creatorActor.userId };

    it("allows Admin, PM, and uploader", () => {
      expect(canDeleteAttachment(adminActor, attachment)).toBe(true);
      expect(canDeleteAttachment(projectPmActor, attachment)).toBe(true);
      expect(canDeleteAttachment(creatorActor, attachment)).toBe(true);
    });

    it("denies Team Lead (non-uploader), other member, and non-member", () => {
      expect(canDeleteAttachment(teamLeadActor, attachment)).toBe(false);
      expect(canDeleteAttachment(assigneeActor, attachment)).toBe(false);
      expect(canDeleteAttachment(otherMemberActor, attachment)).toBe(false);
      expect(canDeleteAttachment(nonMemberActor, attachment)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canDeleteAttachment({ ...adminActor, isProjectArchived: true }, attachment)).toBe(false);
    });
  });

  describe("canManageSprint (FR-36)", () => {
    it("allows Admin, PM, and Team Lead", () => {
      expect(canManageSprint(adminActor)).toBe(true);
      expect(canManageSprint(projectPmActor)).toBe(true);
      expect(canManageSprint(teamLeadActor)).toBe(true);
    });

    it("denies Members and Non-Members", () => {
      expect(canManageSprint(creatorActor)).toBe(false);
      expect(canManageSprint(assigneeActor)).toBe(false);
      expect(canManageSprint(otherMemberActor)).toBe(false);
      expect(canManageSprint(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canManageSprint({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canViewMemberReport (FR-30)", () => {
    it("allows Admin, PM, and Team Lead", () => {
      expect(canViewMemberReport(adminActor)).toBe(true);
      expect(canViewMemberReport(projectPmActor)).toBe(true);
      expect(canViewMemberReport(teamLeadActor)).toBe(true);
    });

    it("denies Members and Non-Members", () => {
      expect(canViewMemberReport(creatorActor)).toBe(false);
      expect(canViewMemberReport(assigneeActor)).toBe(false);
      expect(canViewMemberReport(otherMemberActor)).toBe(false);
      expect(canViewMemberReport(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canViewMemberReport({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canViewProjectReport (FR-31)", () => {
    it("allows Admin and PM", () => {
      expect(canViewProjectReport(adminActor)).toBe(true);
      expect(canViewProjectReport(projectPmActor)).toBe(true);
    });

    it("denies Team Lead, Members, and Non-Members", () => {
      expect(canViewProjectReport(teamLeadActor)).toBe(false);
      expect(canViewProjectReport(creatorActor)).toBe(false);
      expect(canViewProjectReport(assigneeActor)).toBe(false);
      expect(canViewProjectReport(otherMemberActor)).toBe(false);
      expect(canViewProjectReport(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canViewProjectReport({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("canExportProject (FR-32)", () => {
    it("allows Admin and PM", () => {
      expect(canExportProject(adminActor)).toBe(true);
      expect(canExportProject(projectPmActor)).toBe(true);
    });

    it("denies Team Lead, Members, and Non-Members", () => {
      expect(canExportProject(teamLeadActor)).toBe(false);
      expect(canExportProject(creatorActor)).toBe(false);
      expect(canExportProject(assigneeActor)).toBe(false);
      expect(canExportProject(otherMemberActor)).toBe(false);
      expect(canExportProject(nonMemberActor)).toBe(false);
    });

    it("denies when project is archived", () => {
      expect(canExportProject({ ...adminActor, isProjectArchived: true })).toBe(false);
    });
  });

  describe("getProjectPermissions helper (docs/05 §5.3)", () => {
    it("computes ProjectPermissions matching policy flags for Project PM", () => {
      const perms = getProjectPermissions(projectPmActor);
      expect(perms).toEqual({
        canManageProject: true,
        canManageMembers: true,
        canManageSprint: true,
        canViewMemberReport: true,
        canViewProjectReport: true,
        canExportProject: true,
      });
    });

    it("computes ProjectPermissions for Team Lead", () => {
      const perms = getProjectPermissions(teamLeadActor);
      expect(perms).toEqual({
        canManageProject: false,
        canManageMembers: false,
        canManageSprint: true,
        canViewMemberReport: true,
        canViewProjectReport: false,
        canExportProject: false,
      });
    });

    it("computes ProjectPermissions for standard Member", () => {
      const perms = getProjectPermissions(otherMemberActor);
      expect(perms).toEqual({
        canManageProject: false,
        canManageMembers: false,
        canManageSprint: false,
        canViewMemberReport: false,
        canViewProjectReport: false,
        canExportProject: false,
      });
    });

    it("computes all false for archived project, even for Admin", () => {
      const perms = getProjectPermissions({ ...adminActor, isProjectArchived: true });
      expect(perms).toEqual({
        canManageProject: false,
        canManageMembers: false,
        canManageSprint: false,
        canViewMemberReport: false,
        canViewProjectReport: false,
        canExportProject: false,
      });
    });
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
