export const SYSTEM_ROLES = ["MEMBER", "TEAM_LEAD", "PM", "ADMIN"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const PROJECT_ROLES = ["PM", "TEAM_LEAD", "MEMBER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "LOCKED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_CATEGORIES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
