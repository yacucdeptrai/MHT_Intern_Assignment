import { describe, expect, it } from "vitest";

import { buildNotificationTargetUrl, MarkReadSchema, NotificationListQuerySchema } from "../src/schemas/notification";

describe("Notification schemas and utilities", () => {
  describe("NotificationListQuerySchema", () => {
    it("defaults to page 1 and pageSize 20", () => {
      const parsed = NotificationListQuerySchema.parse({});
      expect(parsed).toEqual({ page: 1, pageSize: 20 });
    });

    it("coerces valid page and pageSize query parameters", () => {
      const parsed = NotificationListQuerySchema.parse({ page: "3", pageSize: "50" });
      expect(parsed).toEqual({ page: 3, pageSize: 50 });
    });

    it("rejects non-positive page or pageSize exceeding 100", () => {
      expect(() => NotificationListQuerySchema.parse({ page: "0" })).toThrow();
      expect(() => NotificationListQuerySchema.parse({ pageSize: "101" })).toThrow();
    });
  });

  describe("MarkReadSchema", () => {
    it("accepts valid notification ID", () => {
      const id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const parsed = MarkReadSchema.parse({ notificationId: id });
      expect(parsed.notificationId).toBe(id);
    });

    it("rejects empty notification ID", () => {
      expect(() => MarkReadSchema.parse({ notificationId: "" })).toThrow();
      expect(() => MarkReadSchema.parse({})).toThrow();
    });
  });

  describe("buildNotificationTargetUrl", () => {
    it("builds project URL for PROJECT_MEMBER_ADDED", () => {
      const url = buildNotificationTargetUrl("proj-123", "proj-123", "PROJECT_MEMBER_ADDED");
      expect(url).toBe("/projects/proj-123");
    });

    it("builds task URL for task notification types", () => {
      const types = ["TASK_ASSIGNED", "TASK_COMMENTED", "TASK_APPROVED", "TASK_REJECTED", "TASK_REOPENED"] as const;

      for (const t of types) {
        const url = buildNotificationTargetUrl("proj-123", "task-456", t);
        expect(url).toBe("/projects/proj-123/tasks/task-456");
      }
    });
  });
});
