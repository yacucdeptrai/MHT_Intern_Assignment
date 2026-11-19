import { taskAssigneeRepository, taskRepository } from "@pm/db";
import {
  canExportProject,
  EXPORT_COLUMNS,
  ForbiddenError,
  formatCsv,
  isOverdue,
  sanitizeFormula,
  toActor,
  UnauthorizedError,
  type ExportFormat,
  type ExportRowsResponse,
} from "@pm/domain";

import { loadProjectAccess } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ExportCsvResult {
  format: "csv";
  data: string;
  contentType: string;
  fileName: string;
}

export interface ExportRowsResult {
  format: "rows";
  payload: ExportRowsResponse;
  contentType: string;
  fileName: string;
}

export type ExportResult = ExportCsvResult | ExportRowsResult;

export function buildExportRows(
  projectCode: string,
  tasks: Array<{
    id: string;
    number: number;
    title: string;
    statusName: string;
    statusCategory: string;
    priority: string;
    sprintName: string | null;
    startDate: string | null;
    dueDate: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  assigneesMap: Map<string, string[]>,
  now: Date,
): string[][] {
  return tasks.map((task) => {
    const code = `${projectCode}-${task.number}`;
    const title = sanitizeFormula(task.title);
    const status = sanitizeFormula(task.statusName);
    const category = sanitizeFormula(task.statusCategory);
    const priority = sanitizeFormula(task.priority);
    const assignees = sanitizeFormula(assigneesMap.get(task.id)?.join(", ") ?? "");
    const sprint = sanitizeFormula(task.sprintName ?? "");
    const startDate = sanitizeFormula(task.startDate ?? "");
    const dueDate = sanitizeFormula(task.dueDate ?? "");
    const overdue = sanitizeFormula(isOverdue(task, now) ? "Yes" : "No");
    const createdAt = sanitizeFormula(
      task.createdAt instanceof Date ? task.createdAt.toISOString() : new Date(task.createdAt).toISOString(),
    );
    const updatedAt = sanitizeFormula(
      task.updatedAt instanceof Date ? task.updatedAt.toISOString() : new Date(task.updatedAt).toISOString(),
    );

    return [
      code,
      title,
      status,
      category,
      priority,
      assignees,
      sprint,
      startDate,
      dueDate,
      overdue,
      createdAt,
      updatedAt,
    ];
  });
}

export const exportService = {
  async exportTasks(ctx: RequestContext, projectId: string, format: ExportFormat): Promise<ExportResult> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (!canExportProject(actor)) {
      throw new ForbiddenError("Insufficient permissions to export project tasks");
    }

    const [tasks, assigneeRows] = await Promise.all([
      taskRepository.listForExport(ctx.db, projectId),
      taskAssigneeRepository.listAssigneesByProjectId(ctx.db, projectId),
    ]);

    const assigneesMap = new Map<string, string[]>();
    for (const row of assigneeRows) {
      let list = assigneesMap.get(row.taskId);
      if (!list) {
        list = [];
        assigneesMap.set(row.taskId, list);
      }
      list.push(row.fullName);
    }

    const now = ctx.clock.now();
    const rawRows = buildExportRows(access.project.code, tasks, assigneesMap, now);

    if (format === "csv") {
      const csvContent = formatCsv([[...EXPORT_COLUMNS], ...rawRows]);
      return {
        format: "csv",
        data: csvContent,
        contentType: "text/csv; charset=utf-8",
        fileName: `${access.project.code}-tasks.csv`,
      };
    }

    return {
      format: "rows",
      payload: {
        columns: [...EXPORT_COLUMNS],
        rows: rawRows,
        fileName: `${access.project.code}-tasks.xlsx`,
      },
      contentType: "application/json",
      fileName: `${access.project.code}-tasks.xlsx`,
    };
  },
};
