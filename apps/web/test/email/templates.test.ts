import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  redactInviteTokens,
  renderDeadlineReminderEmail,
  renderInviteEmail,
} from "../../app/services/email/templates";

describe("email templates (FR-29 c4, FR-37 c4)", () => {
  it("escapeHtml escapes & < > \" '", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("FR-29 c4: renders a due-soon email with every user value HTML-escaped", () => {
    const email = renderDeadlineReminderEmail({
      kind: "DUE_SOON",
      taskTitle: "<script>alert(1)</script>",
      projectName: 'Q4 "Launch" & <b>',
      dueDate: "2026-11-20",
      taskUrl: "https://pm.example.com/projects/p1/tasks/t1",
    });
    expect(email.subject).toBe("[Reminder] Task due soon: <script>alert(1)</script>");
    expect(email.text).toContain("This task is due within 24 hours.");
    expect(email.text).toContain('Task: <script>alert(1)</script> in Q4 "Launch" & <b>');
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Q4 &quot;Launch&quot; &amp; &lt;b&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain('href="https://pm.example.com/projects/p1/tasks/t1"');
  });

  it("FR-29 c4: renders an overdue email with its own subject and headline", () => {
    const email = renderDeadlineReminderEmail({
      kind: "OVERDUE",
      taskTitle: "Fix login",
      dueDate: "2026-11-01",
      taskUrl: "https://pm.example.com/projects/p1/tasks/t2",
    });
    expect(email.subject).toBe("[Overdue] Task is overdue: Fix login");
    expect(email.text).toContain("This task is overdue.");
    expect(email.text).toContain("Due date: 2026-11-01");
  });

  it("FR-37 c4: renders the invite email with the link and the project", () => {
    const email = renderInviteEmail({ inviteUrl: "https://pm.example.com/invite/abc123", projectName: "<Ops>" });
    expect(email.text).toContain("Set your password: https://pm.example.com/invite/abc123");
    expect(email.html).toContain("to join <strong>&lt;Ops&gt;</strong>");
  });

  it("redactInviteTokens keeps only the last 4 characters of every invite token", () => {
    // Generated at runtime, like real invite tokens (32 random bytes as hex).
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    expect(redactInviteTokens(`Set your password: https://pm.example.com/invite/${token}`)).toBe(
      `Set your password: https://pm.example.com/invite/…${token.slice(-4)}`,
    );
  });
});
