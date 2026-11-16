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
/** Workers (workerd) rejects PBKDF2 above 100,000 iterations on every plan. */
export const PBKDF2_MAX_ITERATIONS = 100_000;
/** Chosen in M0-T5; the CPU cost on a deployed Worker is tracked as risk R1. */
export const PBKDF2_DEFAULT_ITERATIONS = PBKDF2_MAX_ITERATIONS;
export const PBKDF2_MIN_ITERATIONS = 10_000;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedAvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_SWEEP_LIMIT = 20;
export const OUTBOX_BACKOFF_BASE_MS = MINUTE_MS;
export const CRON_SCHEDULE = "*/5 * * * *";
