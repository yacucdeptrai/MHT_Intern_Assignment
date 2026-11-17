import { describe, expect, it } from "vitest";
import { TaskCreateSchema, TaskIdSchema, TaskUpdateSchema } from "../src/schemas/task";

describe("TaskCreateSchema", () => {
  it("FR-12 c1: accepts valid task creation payload with defaults", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "  Implement task creation  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Implement task creation");
      expect(parsed.data.priority).toBe("MEDIUM");
      expect(parsed.data.description).toBeNull();
      expect(parsed.data.startDate).toBeNull();
      expect(parsed.data.dueDate).toBeNull();
      expect(parsed.data.sprintId).toBeNull();
      expect(parsed.data.parentTaskId).toBeNull();
      expect(parsed.data.assigneeIds).toEqual([]);
    }
  });

  it("FR-12 c1: accepts optional fields and date range", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "Complete milestone M3",
      description: "Detailed description of task creation",
      priority: "HIGH",
      startDate: "2026-12-01",
      dueDate: "2026-12-10",
      assigneeIds: ["u1", "u2"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priority).toBe("HIGH");
      expect(parsed.data.startDate).toBe("2026-12-01");
      expect(parsed.data.dueDate).toBe("2026-12-10");
      expect(parsed.data.assigneeIds).toEqual(["u1", "u2"]);
    }
  });

  it("FR-12 c2: rejects empty title", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("FR-12 c2: rejects title longer than 200 characters", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "a".repeat(201),
    });
    expect(parsed.success).toBe(false);
  });

  it("FR-12 c2: rejects description longer than 10,000 characters", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "Valid title",
      description: "a".repeat(10001),
    });
    expect(parsed.success).toBe(false);
  });

  it("FR-12 c2: rejects due date before start date", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "Valid title",
      startDate: "2026-12-15",
      dueDate: "2026-12-10",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "dueDate");
      expect(issue?.message).toBe("Due date must be on or after start date");
    }
  });

  it("FR-12 c2: parses comma-separated string for assigneeIds", () => {
    const parsed = TaskCreateSchema.safeParse({
      title: "Valid title",
      assigneeIds: "user-1, user-2",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.assigneeIds).toEqual(["user-1", "user-2"]);
    }
  });

  it("TaskIdSchema validates non-empty task ID", () => {
    expect(TaskIdSchema.safeParse({ taskId: "t1" }).success).toBe(true);
    expect(TaskIdSchema.safeParse({ taskId: "" }).success).toBe(false);
  });
});

describe("TaskUpdateSchema", () => {
  it("FR-13 c1: accepts valid update payload with version and fields", () => {
    const parsed = TaskUpdateSchema.safeParse({
      version: 1,
      title: "Updated task title",
      description: "Updated description",
      priority: "HIGH",
      startDate: "2026-12-01",
      dueDate: "2026-12-05",
      sprintId: "sprint-1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.version).toBe(1);
      expect(parsed.data.title).toBe("Updated task title");
      expect(parsed.data.priority).toBe("HIGH");
    }
  });

  it("FR-13 c1: requires positive integer version", () => {
    expect(TaskUpdateSchema.safeParse({ title: "No version" }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ title: "Zero version", version: 0 }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ title: "Negative version", version: -1 }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ title: "Coerced version", version: "2" }).success).toBe(true);
  });

  it("FR-13 c2: rejects due date before start date when both provided", () => {
    const parsed = TaskUpdateSchema.safeParse({
      version: 1,
      startDate: "2026-12-20",
      dueDate: "2026-12-10",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "dueDate");
      expect(issue?.message).toBe("Due date must be on or after start date");
    }
  });

  it("FR-13 c1: transforms empty string dates and sprint to null", () => {
    const parsed = TaskUpdateSchema.safeParse({
      version: 1,
      startDate: "",
      dueDate: "",
      sprintId: "",
      description: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startDate).toBeNull();
      expect(parsed.data.dueDate).toBeNull();
      expect(parsed.data.sprintId).toBeNull();
      expect(parsed.data.description).toBeNull();
    }
  });
});
