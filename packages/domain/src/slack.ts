/**
 * Escapes user-controlled text for Slack mrkdwn. Slack treats `<...>` as links and mentions
 * (`<!channel>`, `<@U123>`, `<https://x|label>`), so `&`, `<`, and `>` must be sent as entities.
 * See https://api.slack.com/reference/surfaces/formatting#escaping
 */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
