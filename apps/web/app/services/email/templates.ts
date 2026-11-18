import type { ReminderKind } from "@pm/domain";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function deadlineReminderSubject(kind: ReminderKind, taskTitle: string): string {
  return kind === "OVERDUE" ? `[Overdue] Task is overdue: ${taskTitle}` : `[Reminder] Task due soon: ${taskTitle}`;
}

export interface DeadlineReminderTemplateInput {
  kind: ReminderKind;
  taskTitle: string;
  projectName?: string;
  dueDate: string;
  taskUrl: string;
}

/** FR-29 due-soon and overdue email. Every user value is HTML-escaped in the HTML part. */
export function renderDeadlineReminderEmail(input: DeadlineReminderTemplateInput): RenderedEmail {
  const headline = input.kind === "OVERDUE" ? "This task is overdue." : "This task is due within 24 hours.";
  const project = input.projectName ? ` in ${input.projectName}` : "";
  const text = [
    headline,
    "",
    `Task: ${input.taskTitle}${project}`,
    `Due date: ${input.dueDate}`,
    `Open the task: ${input.taskUrl}`,
  ].join("\n");
  const projectHtml = input.projectName ? ` in <strong>${escapeHtml(input.projectName)}</strong>` : "";
  const html = [
    `<p>${escapeHtml(headline)}</p>`,
    `<p>Task: <strong>${escapeHtml(input.taskTitle)}</strong>${projectHtml}<br>Due date: ${escapeHtml(input.dueDate)}</p>`,
    `<p><a href="${escapeHtml(input.taskUrl)}">Open the task</a></p>`,
  ].join("\n");
  return { subject: deadlineReminderSubject(input.kind, input.taskTitle), text, html };
}

/** FR-37 invite email. */
export function renderInviteEmail(input: { inviteUrl: string; projectName?: string }): RenderedEmail {
  const where = input.projectName ? ` to join ${input.projectName}` : "";
  const text = [
    `You have been invited${where}.`,
    "",
    `Set your password: ${input.inviteUrl}`,
    "The link expires in 7 days.",
  ].join("\n");
  const whereHtml = input.projectName ? ` to join <strong>${escapeHtml(input.projectName)}</strong>` : "";
  const html = [
    `<p>You have been invited${whereHtml}.</p>`,
    `<p><a href="${escapeHtml(input.inviteUrl)}">Set your password</a></p>`,
    "<p>The link expires in 7 days.</p>",
  ].join("\n");
  return { subject: "You have been invited", text, html };
}

/**
 * Replaces the one-time token in `/invite/<token>` links with `…` plus its last 4 characters, so a
 * logged email can never be used to accept the invite.
 */
export function redactInviteTokens(value: string): string {
  return value.replace(/\/invite\/([A-Za-z0-9_-]+)/g, (_match, token: string) => `/invite/…${token.slice(-4)}`);
}
