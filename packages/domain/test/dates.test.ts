import { describe, expect, it } from "vitest";
import { isDueSoon, isOverdue, isTodayPriority } from "../src/dates";

describe("domain dates: isOverdue, isDueSoon, isTodayPriority (docs/09 §3.5)", () => {
  const baseTask = {
    dueDate: "2026-11-20",
    statusCategory: "IN_PROGRESS",
    deletedAt: null,
    priority: "MEDIUM",
  };

  describe("isOverdue", () => {
    it("returns false for archived tasks", () => {
      const now = new Date("2026-11-25T12:00:00.000Z");
      expect(isOverdue({ ...baseTask, deletedAt: new Date() }, now)).toBe(false);
      expect(isOverdue({ ...baseTask, deletedAt: 123456789 }, now)).toBe(false);
    });

    it("returns false for DONE tasks", () => {
      const now = new Date("2026-11-25T12:00:00.000Z");
      expect(isOverdue({ ...baseTask, statusCategory: "DONE" }, now)).toBe(false);
    });

    it("returns false when dueDate is not set", () => {
      const now = new Date("2026-11-25T12:00:00.000Z");
      expect(isOverdue({ ...baseTask, dueDate: null }, now)).toBe(false);
      expect(isOverdue({ ...baseTask, dueDate: undefined }, now)).toBe(false);
    });

    it("checks boundary around end of due day in APP_TIMEZONE (23:59:59.999+07:00)", () => {
      // 2026-11-20 23:59:59.999 +07:00 is 2026-11-20 16:59:59.999 UTC
      const atEndOfDay = new Date("2026-11-20T16:59:59.999Z");
      expect(isOverdue(baseTask, atEndOfDay)).toBe(false);

      // 1 ms later: 2026-11-21 00:00:00.000 +07:00 is 2026-11-20 17:00:00.000 UTC
      const oneMsAfterEndOfDay = new Date("2026-11-20T17:00:00.000Z");
      expect(isOverdue(baseTask, oneMsAfterEndOfDay)).toBe(true);
    });
  });

  describe("isDueSoon", () => {
    it("returns false for archived tasks", () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      expect(isDueSoon({ ...baseTask, deletedAt: new Date() }, now)).toBe(false);
    });

    it("returns false for DONE tasks", () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      expect(isDueSoon({ ...baseTask, statusCategory: "DONE" }, now)).toBe(false);
    });

    it("returns false when dueDate is not set", () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      expect(isDueSoon({ ...baseTask, dueDate: null }, now)).toBe(false);
    });

    it("returns false when task is already overdue", () => {
      const afterEndOfDay = new Date("2026-11-20T17:00:00.000Z");
      expect(isDueSoon(baseTask, afterEndOfDay)).toBe(false);
    });

    it("checks 24-hour window boundary before end of due day in APP_TIMEZONE", () => {
      // End of day is 2026-11-20 16:59:59.999 UTC
      // 24 hours before is 2026-11-19 16:59:59.999 UTC
      const justBeforeWindow = new Date("2026-11-19T16:59:59.998Z");
      expect(isDueSoon(baseTask, justBeforeWindow)).toBe(false);

      const atWindowStart = new Date("2026-11-19T16:59:59.999Z");
      expect(isDueSoon(baseTask, atWindowStart)).toBe(true);

      const midWindow = new Date("2026-11-20T08:00:00.000Z");
      expect(isDueSoon(baseTask, midWindow)).toBe(true);

      const atEndOfDay = new Date("2026-11-20T16:59:59.999Z");
      expect(isDueSoon(baseTask, atEndOfDay)).toBe(true);
    });
  });

  describe("isTodayPriority", () => {
    it("returns false for archived or DONE tasks regardless of priority or dates", () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      expect(isTodayPriority({ ...baseTask, priority: "URGENT", deletedAt: new Date() }, now)).toBe(false);
      expect(isTodayPriority({ ...baseTask, priority: "URGENT", statusCategory: "DONE" }, now)).toBe(false);
      expect(isTodayPriority({ ...baseTask, priority: "HIGH", statusCategory: "DONE" }, now)).toBe(false);
    });

    it("returns true for HIGH or URGENT tasks even without a due date", () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      expect(isTodayPriority({ ...baseTask, dueDate: null, priority: "HIGH" }, now)).toBe(true);
      expect(isTodayPriority({ ...baseTask, dueDate: null, priority: "URGENT" }, now)).toBe(true);
    });

    it("returns true for overdue tasks regardless of priority", () => {
      const afterEndOfDay = new Date("2026-11-20T17:00:00.000Z");
      expect(isTodayPriority({ ...baseTask, priority: "LOW" }, afterEndOfDay)).toBe(true);
    });

    it("returns true when task is due today in APP_TIMEZONE", () => {
      // 2026-11-20 00:00:00 +07:00 is 2026-11-19 17:00:00 UTC
      const middayInVN = new Date("2026-11-20T05:00:00.000Z");
      expect(isTodayPriority({ ...baseTask, dueDate: "2026-11-20", priority: "LOW" }, middayInVN)).toBe(true);

      // If due tomorrow, not overdue, and priority is LOW -> false
      expect(isTodayPriority({ ...baseTask, dueDate: "2026-11-21", priority: "LOW" }, middayInVN)).toBe(false);
    });
  });
});

