import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { TASK_PRIORITIES } from "@pm/domain";

import { projects } from "./projects";
import { sprints } from "./sprints";
import { taskStatuses } from "./taskStatuses";
import { users } from "./users";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    number: integer("number").notNull(),
    parentTaskId: text("parent_task_id"),
    sprintId: text("sprint_id"),
    statusId: text("status_id")
      .notNull()
      .references(() => taskStatuses.id),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("MEDIUM"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    slackThreadTs: text("slack_thread_ts"),
    statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    unique("uq_tasks_id_project").on(t.id, t.projectId),
    unique("uq_tasks_project_number").on(t.projectId, t.number),
    foreignKey({
      columns: [t.sprintId, t.projectId],
      foreignColumns: [sprints.id, sprints.projectId],
      name: "fk_tasks_sprint_project",
    }),
    foreignKey({
      columns: [t.parentTaskId, t.projectId],
      foreignColumns: [t.id, t.projectId],
      name: "fk_tasks_parent_project",
    }),
    index("idx_tasks_project_status").on(t.projectId, t.deletedAt, t.statusId),
    index("idx_tasks_project_sprint").on(t.projectId, t.sprintId, t.deletedAt),
    index("idx_tasks_parent").on(t.parentTaskId),
    index("idx_tasks_status").on(t.statusId, t.statusChangedAt),
    index("idx_tasks_project_completed").on(t.projectId, t.completedAt),
  ],
);

export type TaskRow = InferSelectModel<typeof tasks>;
export type NewTaskRow = InferInsertModel<typeof tasks>;
