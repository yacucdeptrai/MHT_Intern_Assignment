import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";

import { MarkReadSchema, type NotificationDto, type NotificationPayload, type NotificationType } from "@pm/domain";

import { notificationService } from "../services/notification.service";
import { requireUser } from "../utils/auth.server";
import { formatAuditTimestamp } from "../utils/formatAudit";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const data = await notificationService.listNotifications(ctx, rawQuery);
  return data;
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "markRead") {
    const rawData = Object.fromEntries(formData.entries());
    const parsed = MarkReadSchema.safeParse(rawData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      return Response.json(
        {
          success: false,
          intent: "markRead",
          errors: fieldErrors,
          message: parsed.error.issues[0]?.message ?? "Invalid notification ID",
        },
        { status: 400 },
      );
    }
    await notificationService.markRead(ctx, parsed.data.notificationId);
    return Response.json({ success: true, intent: "markRead" }, { status: 200 });
  }

  if (intent === "markAllRead") {
    await notificationService.markAllRead(ctx);
    return Response.json({ success: true, intent: "markAllRead" }, { status: 200 });
  }

  const intentStr = typeof intent === "string" ? intent : "";
  return Response.json({ success: false, message: `Unknown intent: ${intentStr}` }, { status: 400 });
}

function formatNotificationMessage(type: NotificationType, payload: NotificationPayload): string {
  switch (type) {
    case "TASK_ASSIGNED":
      return `${payload.actorName} assigned you to this task`;
    case "TASK_COMMENTED":
      return `${payload.actorName} commented on this task`;
    case "TASK_APPROVED":
      return `${payload.actorName} approved this task`;
    case "TASK_REJECTED":
      return `${payload.actorName} rejected this task`;
    case "TASK_REOPENED":
      return `${payload.actorName} reopened this task`;
    case "PROJECT_MEMBER_ADDED":
      return `${payload.actorName} added you to this project`;
  }
}

export default function NotificationsRoute() {
  const { notifications, unreadCount } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4">
      {/* Header with Title and Unread Count */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="notification-center-title">
            Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            You have{" "}
            <span className="font-semibold text-blue-600" data-testid="unread-count">
              {unreadCount}
            </span>{" "}
            unread notification{unreadCount === 1 ? "" : "s"}
          </p>
        </div>

        {unreadCount > 0 ? (
          <Form method="post">
            <input type="hidden" name="intent" value="markAllRead" />
            <button
              type="submit"
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              data-testid="mark-all-read-btn"
            >
              Mark all as read
            </button>
          </Form>
        ) : null}
      </div>

      {/* Notifications List */}
      {notifications.items.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl border border-gray-200 bg-white"
          data-testid="no-notifications-msg"
        >
          <p className="text-gray-500 text-sm">No notifications found.</p>
        </div>
      ) : (
        <ul
          className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
          data-testid="notifications-list"
        >
          {notifications.items.map((n: NotificationDto) => {
            const isUnread = n.readAt === null;
            return (
              <li
                key={n.id}
                className={`p-4 transition hover:bg-gray-50 ${isUnread ? "bg-blue-50/40" : "bg-white"}`}
                data-testid={`notification-item-${n.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isUnread ? (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-blue-600"
                          data-testid={`unread-dot-${n.id}`}
                        />
                      ) : null}
                      <Link
                        to={n.targetUrl}
                        className="text-base font-semibold text-blue-700 hover:underline truncate"
                        data-testid={`notification-link-${n.id}`}
                      >
                        {n.payload.title}
                      </Link>
                    </div>

                    <p className="text-sm text-gray-700">{formatNotificationMessage(n.type, n.payload)}</p>

                    {n.payload.reason ? (
                      <p
                        className="text-xs text-red-600 bg-red-50 p-2 rounded mt-1 border border-red-100"
                        data-testid={`notification-reason-${n.id}`}
                      >
                        <span className="font-semibold">Reason:</span> {n.payload.reason}
                      </p>
                    ) : null}

                    <p className="text-xs text-gray-400">{formatAuditTimestamp(new Date(n.createdAt).getTime())}</p>
                  </div>

                  {isUnread ? (
                    <Form method="post" className="shrink-0">
                      <input type="hidden" name="intent" value="markRead" />
                      <input type="hidden" name="notificationId" value={n.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-2 py-1 bg-white hover:bg-gray-50"
                        data-testid={`mark-read-btn-${n.id}`}
                      >
                        Mark as read
                      </button>
                    </Form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
