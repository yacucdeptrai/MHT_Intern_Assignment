import type { ReminderKind } from "@pm/domain";

import { createLogger, type Logger } from "../../utils/logger.server";
import { redactInviteTokens, renderDeadlineReminderEmail, renderInviteEmail } from "./templates";

export interface DeadlineReminderEmailInput {
  to: string;
  subject: string;
  kind: ReminderKind;
  taskTitle: string;
  projectName?: string;
  dueDate: string;
  taskUrl: string;
  idempotencyKey?: string;
}

export interface InviteEmailOptions {
  /** Replace the invite token in logs. Always true outside local development. */
  redactLink?: boolean;
}

/** The outbox handlers send email only through this port (docs/07 §3). */
export interface EmailSender {
  sendInvite: (
    to: string,
    inviteUrl: string,
    projectName?: string,
    options?: InviteEmailOptions,
  ) => void | Promise<void>;
  sendDeadlineReminder: (input: DeadlineReminderEmailInput) => void | Promise<void>;
}

const consoleLogger = createLogger("email-sender");

/**
 * Default sender (`EMAIL_PROVIDER=console`): renders the email and logs it instead of delivering it
 * (FR-29 c4). Invite tokens are redacted unless the caller explicitly allows them (local only).
 */
export const ConsoleEmailSender: EmailSender = {
  sendInvite: (to, inviteUrl, projectName, options) => {
    const email = renderInviteEmail({ inviteUrl, ...(projectName ? { projectName } : {}) });
    const redact = options?.redactLink ?? true;
    consoleLogger.info("Email sent (console)", {
      to,
      kind: "INVITE",
      subject: email.subject,
      text: redact ? redactInviteTokens(email.text) : email.text,
      html: redact ? redactInviteTokens(email.html) : email.html,
    });
  },
  sendDeadlineReminder: (input) => {
    const email = renderDeadlineReminderEmail(input);
    consoleLogger.info("Email sent (console)", {
      to: input.to,
      kind: input.kind,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: input.idempotencyKey,
    });
  },
};

/** Picks the sender for `EMAIL_PROVIDER`. Only `console` exists today; others fall back with a warning. */
export function createEmailSender(env: Pick<Env, "EMAIL_PROVIDER">, logger: Logger): EmailSender {
  if (env.EMAIL_PROVIDER !== "console") {
    logger.warn("Unknown EMAIL_PROVIDER; falling back to the console sender", { provider: env.EMAIL_PROVIDER });
  }
  return ConsoleEmailSender;
}
