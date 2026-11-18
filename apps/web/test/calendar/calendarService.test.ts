import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { NotFoundError, UnauthorizedError } from "@pm/domain";

import { calendarService } from "../../app/services/calendar.service";
import type { SessionUser } from "../../app/utils/auth.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

function createMockContext(
  user: SessionUser | null = null,
  now: Date = new Date("2026-11-19T10:00:00+07:00"),
): RequestContext {
  const db = createDatabase(env.DB);
  return {
    env,
    db,
    user,
    requestId: "cal-test",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => now },
  };
}

describe("calendarService (FR-35)", () => {
  it("throws UnauthorizedError when user is not signed in", async () => {
    const ctx = createMockContext(null);
    await expect(calendarService.getCalendarData(ctx, { view: "month" })).rejects.toThrow(UnauthorizedError);
  });

  it("FR-35 c1: shows tasks with both dates as spans, tasks with only due date on that day, and omits tasks with no dates", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const userId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await userRepository.insert(db, {
      id: userId,
      email: `cal-test-${Date.now()}@example.com`,
      fullName: "Cal User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const ctx = createMockContext(
      { id: userId, systemRole: "MEMBER", email: "cal@example.com", fullName: "Cal User", status: "ACTIVE" },
      now,
    );

    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: `CP${Date.now().toString().slice(-5)}`,
        name: "Calendar Proj",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusId,
        name: `Status-${crypto.randomUUID().slice(0, 6)}`,
        category: "IN_PROGRESS",
        isDefault: true,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const tSpanId = crypto.randomUUID();
    const tSingleId = crypto.randomUUID();
    const tNoDateId = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: tSpanId,
        projectId,
        statusId,
        title: "Span Task (FR-35 c1)",
        startDate: "2026-11-10",
        dueDate: "2026-11-20",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: tSingleId,
        projectId,
        statusId,
        title: "Single Day Task (FR-35 c1)",
        dueDate: "2026-11-19",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: tNoDateId,
        projectId,
        statusId,
        title: "No Date Task (FR-35 c1)",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const data = await calendarService.getCalendarData(ctx, {
      view: "month",
      date: "2026-11-19",
      projectId,
    });

    expect(data.view).toBe("month");
    expect(data.range.from).toBe("2026-11-01");
    expect(data.range.to).toBe("2026-11-30");

    const spanEvent = data.events.find((e) => e.id === tSpanId);
    expect(spanEvent).toBeDefined();
    expect(spanEvent?.isSpan).toBe(true);
    expect(spanEvent?.startDate).toBe("2026-11-10");
    expect(spanEvent?.dueDate).toBe("2026-11-20");

    const singleEvent = data.events.find((e) => e.id === tSingleId);
    expect(singleEvent).toBeDefined();
    expect(singleEvent?.isSpan).toBe(false);
    expect(singleEvent?.dueDate).toBe("2026-11-19");

    const noDateEvent = data.events.find((e) => e.id === tNoDateId);
    expect(noDateEvent).toBeUndefined();
  });

  it("FR-35 c2 / P3: returns 404 NotFoundError when user attempts to filter by non-accessible project", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await userRepository.insert(db, {
      id: userId,
      email: `cal-nonmember-${Date.now()}@example.com`,
      fullName: "Non-Member User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    await userRepository.insert(db, {
      id: otherUserId,
      email: `cal-creator-${Date.now()}@example.com`,
      fullName: "Creator User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const ctx = createMockContext(
      {
        id: userId,
        systemRole: "MEMBER",
        email: "nonmember@example.com",
        fullName: "Non-Member User",
        status: "ACTIVE",
      },
      now,
    );

    const privateProjectId = crypto.randomUUID();
    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: privateProjectId,
        code: `PRV${Date.now().toString().slice(-5)}`,
        name: "Private Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: otherUserId,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    await expect(
      calendarService.getCalendarData(ctx, {
        view: "month",
        projectId: privateProjectId,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("FR-35 c3: supports day and week view queries", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const userId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await userRepository.insert(db, {
      id: userId,
      email: `cal-views-${Date.now()}@example.com`,
      fullName: "Views User",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const ctx = createMockContext(
      { id: userId, systemRole: "ADMIN", email: "admin@example.com", fullName: "Admin User", status: "ACTIVE" },
      now,
    );

    const dayData = await calendarService.getCalendarData(ctx, {
      view: "day",
      date: "2026-11-19",
    });
    expect(dayData.view).toBe("day");
    expect(dayData.range).toEqual({ from: "2026-11-19", to: "2026-11-19" });

    const weekData = await calendarService.getCalendarData(ctx, {
      view: "week",
      date: "2026-11-19",
    });
    expect(weekData.view).toBe("week");
    expect(weekData.range).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });
});
