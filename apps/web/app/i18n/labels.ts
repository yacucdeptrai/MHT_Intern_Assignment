import type { TFunction } from "i18next";

import type { ProjectStatus, StatusCategory, SystemRole, TaskPriority } from "@pm/domain";

/** Role name shown in badges and the sidebar footer (system and project roles share names). */
export function translateRole(t: TFunction, role: SystemRole): string {
  switch (role) {
    case "ADMIN":
      return t("shell.role_admin");
    case "PM":
      return t("shell.role_pm");
    case "TEAM_LEAD":
      return t("shell.role_team_lead");
    case "MEMBER":
      return t("shell.role_member");
  }
}

/** Project status in sentence case ("On hold"), never the raw enum. */
export function translateProjectStatus(t: TFunction, status: ProjectStatus): string {
  switch (status) {
    case "ACTIVE":
      return t("project_layout.status_ACTIVE");
    case "ON_HOLD":
      return t("project_layout.status_ON_HOLD");
    case "COMPLETED":
      return t("project_layout.status_COMPLETED");
  }
}

/** Status category name ("In progress"). Color and board columns follow the category. */
export function translateCategory(t: TFunction, category: StatusCategory): string {
  switch (category) {
    case "TODO":
      return t("labels.category_TODO");
    case "IN_PROGRESS":
      return t("labels.category_IN_PROGRESS");
    case "REVIEW":
      return t("labels.category_REVIEW");
    case "DONE":
      return t("labels.category_DONE");
  }
}

export function translatePriority(t: TFunction, priority: TaskPriority): string {
  switch (priority) {
    case "LOW":
      return t("labels.priority_LOW");
    case "MEDIUM":
      return t("labels.priority_MEDIUM");
    case "HIGH":
      return t("labels.priority_HIGH");
    case "URGENT":
      return t("labels.priority_URGENT");
  }
}

/** Accessible name for a status glyph (category or Pending / Re-open / Cancelled override). */
export function translateStatusGlyph(t: TFunction, glyph: StatusCategory | "PENDING" | "REOPEN" | "CANCELLED"): string {
  switch (glyph) {
    case "PENDING":
      return t("labels.glyph_PENDING");
    case "REOPEN":
      return t("labels.glyph_REOPEN");
    case "CANCELLED":
      return t("labels.glyph_CANCELLED");
    default:
      return translateCategory(t, glyph);
  }
}
