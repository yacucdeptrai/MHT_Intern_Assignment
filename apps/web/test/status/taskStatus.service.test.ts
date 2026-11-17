import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, taskStatusRepository, userRepository } from "@pm/db";
import { ForbiddenError, ValidationError } from "@pm/domain";
import { taskStatusService } from "../../app/services/taskStatus.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createMockContext(role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "ADMIN"): Promise<RequestContext> {
  const id = crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}@example.com`;
  const fullName = `${role} User`;

  await userRepository.insert(db, {
    id,
    email,
    fullName,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  return {
    env,
    db,
    user: {
      id,
      email,
      fullName,
      systemRole: role,
      status: "ACTIVE",
    },
    requestId: "test-req-id",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };
}

describe("taskStatusService", () => {
  describe("FR-20 c1: Create status", () => {
    it("creates a status with name and category and records audit STATUS_CREATED", async () => {
      const ctx = await createMockContext("ADMIN");
      const name = `Triaged-${Date.now()}`;

      const created = await taskStatusService.createStatus(ctx, {
        name,
        category: "TODO",
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe(name);
      expect(created.category).toBe("TODO");
      expect(created.isDefault).toBe(false);

      const logs = await auditLogRepository.listByEntity(ctx.db, "STATUS", created.id);
      expect(logs).toHaveLength(1);
      const firstLog = logs[0];
      expect(firstLog).toBeDefined();
      expect(firstLog?.action).toBe("STATUS_CREATED");
    });

    it("FR-20 c1: rejects duplicate name (case-insensitive) with 400", async () => {
      const ctx = await createMockContext("ADMIN");
      const name = `Duplicate-${Date.now()}`;

      await taskStatusService.createStatus(ctx, {
        name,
        category: "TODO",
      });

      await expect(
        taskStatusService.createStatus(ctx, {
          name: name.toLowerCase(),
          category: "IN_PROGRESS",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("FR-20 c2: Update and Reorder", () => {
    it("renames a status and records audit STATUS_UPDATED", async () => {
      const ctx = await createMockContext("ADMIN");
      const created = await taskStatusService.createStatus(ctx, {
        name: `Original-${Date.now()}`,
        category: "TODO",
      });

      const updated = await taskStatusService.updateStatus(ctx, {
        statusId: created.id,
        name: `Renamed-${Date.now()}`,
      });

      expect(updated.name).toMatch(/^Renamed-/);

      const logs = await auditLogRepository.listByEntity(ctx.db, "STATUS", created.id);
      const updateLog = logs.find((l) => l.action === "STATUS_UPDATED");
      expect(updateLog).toBeDefined();
    });

    it("reorders statuses atomically", async () => {
      const ctx = await createMockContext("ADMIN");
      const s1 = await taskStatusService.createStatus(ctx, { name: `Order1-${Date.now()}`, category: "TODO" });
      const s2 = await taskStatusService.createStatus(ctx, { name: `Order2-${Date.now()}`, category: "TODO" });

      await taskStatusService.reorderStatuses(ctx, { orderedIds: [s2.id, s1.id] });

      const list = await taskStatusService.listStatuses(ctx);
      const posS2 = list.find((s) => s.id === s2.id)?.position;
      const posS1 = list.find((s) => s.id === s1.id)?.position;
      expect(posS1).toBeDefined();
      expect(posS2).toBeDefined();
      if (posS1 !== undefined && posS2 !== undefined) {
        expect(posS2).toBeLessThan(posS1);
      }
    });

    it("FR-20 c2 / A25: sets a new default, clearing the old one atomically with audit", async () => {
      const ctx = await createMockContext("ADMIN");
      const oldDefault = await taskStatusRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        name: `CurrentDef-${Date.now()}`,
        category: "IN_PROGRESS",
        position: 1,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const newDefault = await taskStatusService.createStatus(ctx, {
        name: `NewDef-${Date.now()}`,
        category: "IN_PROGRESS",
      });

      await taskStatusService.setDefault(ctx, { statusId: newDefault.id });

      const oldReloaded = await taskStatusRepository.findById(ctx.db, oldDefault.id);
      const newReloaded = await taskStatusRepository.findById(ctx.db, newDefault.id);

      expect(oldReloaded?.isDefault).toBe(false);
      expect(newReloaded?.isDefault).toBe(true);

      const logs = await auditLogRepository.listByEntity(ctx.db, "STATUS", newDefault.id);
      const defaultLog = logs.find((l) => l.action === "STATUS_UPDATED");
      expect(defaultLog).toBeDefined();
    });
  });

  describe("FR-20 c3 / A26: Delete status", () => {
    it("deletes an unused non-default status and records audit STATUS_DELETED", async () => {
      const ctx = await createMockContext("ADMIN");
      const created = await taskStatusService.createStatus(ctx, {
        name: `ToDelete-${Date.now()}`,
        category: "TODO",
      });

      await taskStatusService.deleteStatus(ctx, { statusId: created.id });

      const found = await taskStatusRepository.findById(ctx.db, created.id);
      expect(found).toBeNull();

      const logs = await auditLogRepository.listByEntity(ctx.db, "STATUS", created.id);
      const deleteLog = logs.find((l) => l.action === "STATUS_DELETED");
      expect(deleteLog).toBeDefined();
    });

    it("rejects deleting a category default status with 400", async () => {
      const ctx = await createMockContext("ADMIN");
      const defaultStatus = await taskStatusRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        name: `Default-No-Delete-${Date.now()}`,
        category: "REVIEW",
        position: 1,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(taskStatusService.deleteStatus(ctx, { statusId: defaultStatus.id })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("FR-20 c5: Non-Admin receives 403 ForbiddenError", () => {
    it("rejects non-Admin on createStatus", async () => {
      const ctx = await createMockContext("PM");
      await expect(taskStatusService.createStatus(ctx, { name: "Forbidden", category: "TODO" })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("rejects non-Admin on updateStatus", async () => {
      const ctx = await createMockContext("TEAM_LEAD");
      await expect(taskStatusService.updateStatus(ctx, { statusId: "any-id", name: "Forbidden" })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("rejects non-Admin on reorderStatuses", async () => {
      const ctx = await createMockContext("MEMBER");
      await expect(taskStatusService.reorderStatuses(ctx, { orderedIds: ["s1", "s2"] })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("rejects non-Admin on setDefault", async () => {
      const ctx = await createMockContext("PM");
      await expect(taskStatusService.setDefault(ctx, { statusId: "any-id" })).rejects.toThrow(ForbiddenError);
    });

    it("rejects non-Admin on deleteStatus", async () => {
      const ctx = await createMockContext("MEMBER");
      await expect(taskStatusService.deleteStatus(ctx, { statusId: "any-id" })).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Seed default statuses", () => {
    it("seeds the 4 default categories when missing", async () => {
      const ctx = await createMockContext("ADMIN");
      await taskStatusService.seedDefaultStatuses(ctx);

      const list = await taskStatusRepository.list(ctx.db);
      expect(list.length).toBeGreaterThanOrEqual(4);

      const defaults = list.filter((s) => s.isDefault);
      expect(defaults.some((d) => d.category === "TODO")).toBe(true);
      expect(defaults.some((d) => d.category === "IN_PROGRESS")).toBe(true);
      expect(defaults.some((d) => d.category === "REVIEW")).toBe(true);
      expect(defaults.some((d) => d.category === "DONE")).toBe(true);
    });
  });
});
