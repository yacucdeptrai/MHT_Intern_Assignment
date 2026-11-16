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

export const OAUTH_PROVIDERS = ["GOOGLE", "MICROSOFT"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const AUDIT_ENTITY_TYPES = [
  "USER",
  "PROJECT",
  "PROJECT_MEMBER",
  "SPRINT",
  "TASK",
  "ATTACHMENT",
  "STATUS",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_ARCHIVED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_ROLE_CHANGED",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_STATUS_CHANGED",
  "TASK_ASSIGNED",
  "TASK_APPROVED",
  "TASK_REJECTED",
  "TASK_REOPENED",
  "TASK_ARCHIVED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "SPRINT_CREATED",
  "SPRINT_UPDATED",
  "SPRINT_ARCHIVED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_LOCKED",
  "USER_UNLOCKED",
  "USER_DELETED",
  "USER_ROLE_CHANGED",
  "STATUS_CREATED",
  "STATUS_UPDATED",
  "STATUS_DELETED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_COMMENTED",
  "TASK_APPROVED",
  "TASK_REJECTED",
  "TASK_REOPENED",
  "PROJECT_MEMBER_ADDED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const OUTBOX_JOB_TYPES = [
  "SLACK_POST_TASK",
  "SLACK_UPDATE_THREAD",
  "EMAIL_DEADLINE_REMINDER",
  "EMAIL_INVITE",
] as const;
export type OutboxJobType = (typeof OUTBOX_JOB_TYPES)[number];

export const OUTBOX_JOB_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED", "DEAD", "SKIPPED"] as const;
export type OutboxJobStatus = (typeof OUTBOX_JOB_STATUSES)[number];

export const REMINDER_KINDS = ["DUE_SOON", "OVERDUE"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
