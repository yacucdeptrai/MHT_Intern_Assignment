import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../constants";

export const VALIDATION_MESSAGES = {
  "validation.reason_required": "A reason is required",
  "validation.status_reorder_min": "At least one status ID is required",
  "validation.attachment_id_required": "Attachment ID is required",
  "validation.budget_non_negative": "Budget cannot be negative",
  "validation.budget_must_be_integer": "Budget must be an integer",
  "validation.comment_id_required": "Comment ID is required",
  "validation.comment_cannot_be_empty": "Comment cannot be empty",
  "validation.comment_max_length": "Comment must be at most 5,000 characters",
  "validation.invalid_calendar_date": "Date must be a valid calendar date in YYYY-MM-DD format",
  "validation.department_max_length": "Department must be at most 100 characters",
  "validation.description_max_length": "Description must be at most 10,000 characters",
  "validation.task_description_max_length": "Description must not exceed 10,000 characters",
  "validation.due_date_format": "Due date must be in YYYY-MM-DD format",
  "validation.due_date_after_start": "Due date must be on or after start date",
  "validation.end_date_format": "End date must be in YYYY-MM-DD format",
  "validation.end_date_after_start": "End date must be on or after start date",
  "validation.full_name_required": "Full name is required",
  "validation.full_name_max_length": "Full name must be at most 100 characters",
  "validation.invalid_date_format": "Invalid date format",
  "validation.invalid_email": "Invalid email format",
  "validation.status_name_required": "Name is required",
  "validation.status_name_max_length": "Name must be at most 50 characters",
  "validation.notification_id_required": "Notification ID is required",
  "validation.password_required": "Password is required",
  "validation.password_min_length": `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  "validation.password_max_length": `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  "validation.passwords_do_not_match": "Passwords do not match",
  "validation.phone_max_length": "Phone number must be at most 30 characters",
  "validation.confirm_password_required": "Please confirm your password",
  "validation.project_id_required": "Project ID is required",
  "validation.project_code_min_length": "Project code must be at least 2 characters",
  "validation.project_code_max_length": "Project code must be at most 10 characters",
  "validation.project_code_format": "Project code must only contain letters, numbers, and hyphens",
  "validation.project_name_required": "Project name is required",
  "validation.project_name_max_length": "Project name must be at most 150 characters",
  "validation.reason_max_length": "Reason must not exceed 2,000 characters",
  "validation.slack_channel_id_max_length": "Slack channel ID must be at most 50 characters",
  "validation.sprint_id_required": "Sprint ID is required",
  "validation.sprint_name_length": "Sprint name must be between 1 and 100 characters",
  "validation.start_date_format": "Start date must be in YYYY-MM-DD format",
  "validation.status_id_required": "Status ID is required",
  "validation.task_status_required": "Status is required",
  "validation.task_id_required": "Task ID is required",
  "validation.task_title_min_length": "Title must be at least 1 character",
  "validation.task_title_max_length": "Title must not exceed 200 characters",
  "validation.user_id_required": "User ID is required",
  "validation.version_positive": "Version must be a positive integer",
} as const;

export type ValidationMessageKey = keyof typeof VALIDATION_MESSAGES;

const MESSAGE_TO_KEY = new Map<string, ValidationMessageKey>(
  Object.entries(VALIDATION_MESSAGES).map(([k, v]) => [v, k as ValidationMessageKey]),
);

export function getValidationMessageKey(message: string): ValidationMessageKey | undefined {
  return MESSAGE_TO_KEY.get(message);
}
