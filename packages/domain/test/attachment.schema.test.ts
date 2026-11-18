import { describe, expect, it } from "vitest";

import {
  AttachmentIdSchema,
  AttachmentUploadSchema,
  canDeleteAttachment,
  canUploadAttachment,
  type ActorContext,
} from "../src";

describe("Attachment schemas & policies (FR-18)", () => {
  describe("AttachmentIdSchema", () => {
    it("accepts valid attachment ID", () => {
      const result = AttachmentIdSchema.safeParse({ attachmentId: "att-123-uuid" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attachmentId).toBe("att-123-uuid");
      }
    });

    it("rejects empty attachment ID", () => {
      const result = AttachmentIdSchema.safeParse({ attachmentId: "   " });
      expect(result.success).toBe(false);
    });
  });

  describe("AttachmentUploadSchema", () => {
    it("accepts valid project and task IDs", () => {
      const result = AttachmentUploadSchema.safeParse({ projectId: "proj-1", taskId: "task-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing projectId or taskId", () => {
      expect(AttachmentUploadSchema.safeParse({ taskId: "task-1" }).success).toBe(false);
      expect(AttachmentUploadSchema.safeParse({ projectId: "proj-1" }).success).toBe(false);
    });
  });

  describe("canUploadAttachment policy (FR-18 c1)", () => {
    const adminActor: ActorContext = {
      userId: "u-admin",
      systemRole: "ADMIN",
      projectRole: null,
      isProjectArchived: false,
    };
    const memberActor: ActorContext = {
      userId: "u-member",
      systemRole: "MEMBER",
      projectRole: "MEMBER",
      isProjectArchived: false,
    };
    const nonMemberActor: ActorContext = {
      userId: "u-non-member",
      systemRole: "MEMBER",
      projectRole: null,
      isProjectArchived: false,
    };
    const archivedMemberActor: ActorContext = {
      userId: "u-member",
      systemRole: "MEMBER",
      projectRole: "MEMBER",
      isProjectArchived: true,
    };

    it("allows project members and admins", () => {
      expect(canUploadAttachment(adminActor)).toBe(true);
      expect(canUploadAttachment(memberActor)).toBe(true);
    });

    it("denies non-members and archived projects", () => {
      expect(canUploadAttachment(nonMemberActor)).toBe(false);
      expect(canUploadAttachment(archivedMemberActor)).toBe(false);
    });
  });

  describe("canDeleteAttachment policy (FR-18 c4)", () => {
    const adminActor: ActorContext = {
      userId: "u-admin",
      systemRole: "ADMIN",
      projectRole: null,
      isProjectArchived: false,
    };
    const pmActor: ActorContext = {
      userId: "u-pm",
      systemRole: "MEMBER",
      projectRole: "PM",
      isProjectArchived: false,
    };
    const uploaderActor: ActorContext = {
      userId: "u-uploader",
      systemRole: "MEMBER",
      projectRole: "MEMBER",
      isProjectArchived: false,
    };
    const otherMemberActor: ActorContext = {
      userId: "u-other",
      systemRole: "MEMBER",
      projectRole: "MEMBER",
      isProjectArchived: false,
    };
    const archivedPmActor: ActorContext = {
      userId: "u-pm",
      systemRole: "MEMBER",
      projectRole: "PM",
      isProjectArchived: true,
    };

    const targetAttachment = { uploadedById: "u-uploader" };

    it("allows uploader, project PM, and Admin", () => {
      expect(canDeleteAttachment(adminActor, targetAttachment)).toBe(true);
      expect(canDeleteAttachment(pmActor, targetAttachment)).toBe(true);
      expect(canDeleteAttachment(uploaderActor, targetAttachment)).toBe(true);
    });

    it("denies other project members who are not the uploader", () => {
      expect(canDeleteAttachment(otherMemberActor, targetAttachment)).toBe(false);
    });

    it("denies operations on archived projects", () => {
      expect(canDeleteAttachment(archivedPmActor, targetAttachment)).toBe(false);
    });
  });
});
