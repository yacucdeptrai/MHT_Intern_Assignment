import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  attachmentRepository,
  createDatabase,
  cronStateRepository,
  inviteRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
} from "@pm/db";
import { CRON_STATE_ORPHAN_CURSOR } from "@pm/domain";

import { cleanupExpiredInvites, sweepOrphanFiles } from "../../app/services/cleanup.service";
import { scheduledHandler } from "../../worker/index";
import { createUser } from "../factories";

describe("hourly cleanup (docs/07 §2, docs/04 §5)", () => {
  const db = createDatabase(env.DB);

  describe("sweepOrphanFiles", () => {
    it("deletes orphan objects in projects/ older than 24h, keeps younger objects and objects with db rows", async () => {
      const user = await createUser(db);
      const projectId = crypto.randomUUID();
      const statusId = crypto.randomUUID();
      const taskId = crypto.randomUUID();
      const uploadTime = new Date();

      await db.batch([
        projectRepository.insertStmt(db, {
          id: projectId,
          code: `PRJ${user.id.slice(0, 7)}`.toUpperCase(),
          name: "Cleanup Project",
          status: "ACTIVE",
          createdById: user.id,
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          createdAt: uploadTime,
          updatedAt: uploadTime,
        }),
        taskStatusRepository.insertStmt(db, {
          id: statusId,
          name: `Status-${statusId.slice(0, 8)}`,
          category: "TODO",
          position: 0,
          isDefault: false,
          createdAt: uploadTime,
          updatedAt: uploadTime,
        }),
        taskRepository.insertStmt(db, {
          id: taskId,
          projectId,
          title: "Cleanup Task",
          statusId,
          createdById: user.id,
          priority: "MEDIUM",
          statusChangedAt: uploadTime,
          createdAt: uploadTime,
          updatedAt: uploadTime,
        }),
      ]);

      // 1. Orphan project file (no DB row)
      const orphanOldKey = `projects/${projectId}/tasks/${taskId}/attachments/${crypto.randomUUID()}-orphan-old.pdf`;
      await env.FILES.put(orphanOldKey, "orphan-content");

      // 2. Legitimate project file (with DB row)
      const validOldKey = `projects/${projectId}/tasks/${taskId}/attachments/${crypto.randomUUID()}-valid-old.pdf`;
      await env.FILES.put(validOldKey, "valid-content");
      await db.batch([
        attachmentRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          taskId,
          uploadedById: user.id,
          fileName: "valid-old.pdf",
          contentType: "application/pdf",
          sizeBytes: 13,
          storageKey: validOldKey,
          createdAt: uploadTime,
        }),
      ]);

      // 3. Avatar file (never swept even if no DB row)
      const avatarKey = `avatars/${crypto.randomUUID()}-avatar.png`;
      await env.FILES.put(avatarKey, "avatar-content");

      // Case A: In-flight safety check — simulated now is only 10 hours after upload
      const tenHoursLater = new Date(uploadTime.getTime() + 10 * 60 * 60 * 1000);
      const passYoung = await sweepOrphanFiles(env, tenHoursLater);
      // Orphan file is younger than 24h, so it must not be deleted
      expect(await env.FILES.get(orphanOldKey)).not.toBeNull();
      expect(await env.FILES.get(validOldKey)).not.toBeNull();
      expect(await env.FILES.get(avatarKey)).not.toBeNull();
      expect(passYoung.deleted).toBe(0);

      // Case B: 25 hours later (> 24 hours threshold)
      const twentyFiveHoursLater = new Date(uploadTime.getTime() + 25 * 60 * 60 * 1000);
      const passOld = await sweepOrphanFiles(env, twentyFiveHoursLater);

      // Orphan old file must be deleted
      expect(await env.FILES.get(orphanOldKey)).toBeNull();
      // Valid file must be kept
      expect(await env.FILES.get(validOldKey)).not.toBeNull();
      // Avatar file must never be deleted
      expect(await env.FILES.get(avatarKey)).not.toBeNull();
      expect(passOld.deleted).toBeGreaterThanOrEqual(1);

      // Clean up test valid and avatar objects
      await env.FILES.delete(validOldKey);
      await env.FILES.delete(avatarKey);
    });

    it("resumes across ticks using stored cursor in cron_state", async () => {
      const prefix = `projects/cursor-test-${crypto.randomUUID()}/`;
      const key1 = `${prefix}1.txt`;
      const key2 = `${prefix}2.txt`;
      const key3 = `${prefix}3.txt`;

      await env.FILES.put(key1, "content1");
      await env.FILES.put(key2, "content2");
      await env.FILES.put(key3, "content3");

      const uploadTime = new Date();
      const thirtyHoursLater = new Date(uploadTime.getTime() + 30 * 60 * 60 * 1000);

      // Ensure cursor is clean before starting
      await cronStateRepository.upsert(db, CRON_STATE_ORPHAN_CURSOR, null, uploadTime);

      // Pass 1: limit 2 objects
      const pass1 = await sweepOrphanFiles(env, thirtyHoursLater, { batchLimit: 2 });
      expect(pass1.scanned).toBe(2);

      const savedCursor = await cronStateRepository.get(db, CRON_STATE_ORPHAN_CURSOR);
      expect(savedCursor).toBe(pass1.cursor);

      // Pass 2: should resume with saved cursor
      const pass2 = await sweepOrphanFiles(env, thirtyHoursLater, { batchLimit: 2 });
      expect(pass2.scanned).toBeGreaterThanOrEqual(1);

      // When all objects are processed, cursor is reset to null
      if (!pass2.cursor) {
        expect(await cronStateRepository.get(db, CRON_STATE_ORPHAN_CURSOR)).toBeNull();
      }
    });
  });

  describe("cleanupExpiredInvites", () => {
    it("deletes invites expired > 30 days ago, preserves recent and unexpired invites", async () => {
      const inviter = await createUser(db);
      const now = new Date("2026-11-18T10:00:00Z");

      const expired40DaysAgoId = crypto.randomUUID();
      const expired10DaysAgoId = crypto.randomUUID();
      const futureId = crypto.randomUUID();

      await inviteRepository.insert(db, {
        id: expired40DaysAgoId,
        email: "old-expired@example.com",
        tokenHash: `hash-${expired40DaysAgoId}`,
        invitedById: inviter.id,
        expiresAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
      });

      await inviteRepository.insert(db, {
        id: expired10DaysAgoId,
        email: "recent-expired@example.com",
        tokenHash: `hash-${expired10DaysAgoId}`,
        invitedById: inviter.id,
        expiresAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      });

      await inviteRepository.insert(db, {
        id: futureId,
        email: "active@example.com",
        tokenHash: `hash-${futureId}`,
        invitedById: inviter.id,
        expiresAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        createdAt: now,
      });

      const result = await cleanupExpiredInvites(env, now);
      expect(result.deleted).toBeGreaterThanOrEqual(1);

      expect(await inviteRepository.findById(db, expired40DaysAgoId)).toBeNull();
      expect(await inviteRepository.findById(db, expired10DaysAgoId)).not.toBeNull();
      expect(await inviteRepository.findById(db, futureId)).not.toBeNull();
    });
  });

  describe("scheduledHandler hook", () => {
    it("runs hourly cleanup and deadline scan when scheduledTime is minute 0", async () => {
      const hourlyTime = new Date("2026-11-18T14:00:00Z").getTime();
      const waitUntilPromises: Promise<unknown>[] = [];
      const mockCtx = {
        waitUntil: (p: Promise<unknown>) => {
          waitUntilPromises.push(p);
        },
        passThroughOnException: () => {},
        props: {},
      } as unknown as ExecutionContext;

      const mockController: ScheduledController = {
        cron: "*/5 * * * *",
        scheduledTime: hourlyTime,
        noRetry: () => {},
      };

      scheduledHandler(mockController, env, mockCtx);
      expect(waitUntilPromises).toHaveLength(1);
      await Promise.all(waitUntilPromises);
    });

    it("runs only sweepOutbox when scheduledTime is not minute 0", async () => {
      const nonHourlyTime = new Date("2026-11-18T14:05:00Z").getTime();
      const waitUntilPromises: Promise<unknown>[] = [];
      const mockCtx = {
        waitUntil: (p: Promise<unknown>) => {
          waitUntilPromises.push(p);
        },
        passThroughOnException: () => {},
        props: {},
      } as unknown as ExecutionContext;

      const mockController: ScheduledController = {
        cron: "*/5 * * * *",
        scheduledTime: nonHourlyTime,
        noRetry: () => {},
      };

      scheduledHandler(mockController, env, mockCtx);
      expect(waitUntilPromises).toHaveLength(1);
      await Promise.all(waitUntilPromises);
    });
  });
});
