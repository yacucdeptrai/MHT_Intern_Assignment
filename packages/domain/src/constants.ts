const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const APP_NAME = "Project & Task Management";
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";
export const APP_CURRENCY = "VND";

export const TOKEN_INVITE_EXPIRY_MS = 7 * DAY_MS;
export const DUE_SOON_WINDOW_MS = DAY_MS;
export const REVIEW_STALE_MS = 2 * DAY_MS;
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_SWEEP_LIMIT = 20;
export const OUTBOX_BACKOFF_BASE_MS = MINUTE_MS;
export const CRON_SCHEDULE = "*/5 * * * *";
