import type { CalendarEvent, CalendarLoaderData, CalendarProjectOption, CalendarQuery } from "@pm/domain";
import { getCalendarRange, getTodayDateString, UnauthorizedError } from "@pm/domain";
import { projectRepository, taskRepository } from "@pm/db";

import { loadProjectAccess } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export const calendarService = {
  async getCalendarData(ctx: RequestContext, query: CalendarQuery): Promise<CalendarLoaderData> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const now = ctx.clock.now();
    const todayStr = getTodayDateString(now);
    const date = query.date || todayStr;
    const view = query.view;

    const isAdmin = ctx.user.systemRole === "ADMIN";

    let userProjects: CalendarProjectOption[];
    let allowedProjectIds: string[] | undefined;

    if (isAdmin) {
      const allActive = await projectRepository.listAll(ctx.db);
      userProjects = allActive
        .filter((p) => p.status === "ACTIVE")
        .map((p) => ({ id: p.id, code: p.code, name: p.name }))
        .sort((a, b) => a.code.localeCompare(b.code));
    } else {
      const memberProjects = await projectRepository.listForUser(ctx.db, ctx.user.id);
      userProjects = memberProjects
        .filter((p) => p.status === "ACTIVE")
        .map((p) => ({ id: p.id, code: p.code, name: p.name }))
        .sort((a, b) => a.code.localeCompare(b.code));
      allowedProjectIds = userProjects.map((p) => p.id);
    }

    let filterProjectId: string | undefined;
    if (query.projectId) {
      await loadProjectAccess(ctx, query.projectId);
      filterProjectId = query.projectId;
    }

    const range = getCalendarRange(view, date);

    const rawTasks = await taskRepository.listCalendarTasks(ctx.db, {
      from: range.from,
      to: range.to,
      projectId: filterProjectId,
      allowedProjectIds: filterProjectId ? undefined : allowedProjectIds,
    });

    const events: CalendarEvent[] = rawTasks
      .filter((t) => t.dueDate !== null)
      .map((t) => ({
        id: t.id,
        projectId: t.projectId,
        projectCode: t.projectCode,
        projectName: t.projectName,
        number: t.number,
        title: t.title,
        priority: t.priority,
        statusId: t.statusId,
        statusName: t.statusName,
        statusCategory: t.statusCategory,
        startDate: t.startDate,
        dueDate: t.dueDate as string,
        isSpan: Boolean(t.startDate && t.dueDate),
      }));

    return {
      view,
      date,
      range,
      events,
      projects: userProjects,
      selectedProjectId: filterProjectId,
    };
  },
};
