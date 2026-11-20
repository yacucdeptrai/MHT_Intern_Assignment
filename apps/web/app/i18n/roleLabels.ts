import type { TFunction } from "i18next";

import type { ProjectStatus, SystemRole } from "@pm/domain";

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
