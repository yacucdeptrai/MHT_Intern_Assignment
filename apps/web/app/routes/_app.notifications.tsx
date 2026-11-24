import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigate } from "react-router";

import { MarkReadSchema, type NotificationDto, type NotificationType } from "@pm/domain";

import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/cx";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon, type IconName } from "../components/ui/Icon";
import { Page } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Tabs } from "../components/ui/Tabs";

import { notificationService } from "../services/notification.service";
import { requireUser } from "../utils/auth.server";
import { formatRelativeTime } from "../utils/format";
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

const NOTIFICATION_ICON: Record<NotificationType, IconName> = {
  TASK_ASSIGNED: "user-plus",
  TASK_COMMENTED: "message-square",
  TASK_APPROVED: "thumbs-up",
  TASK_REJECTED: "thumbs-down",
  TASK_REOPENED: "rotate-ccw",
  PROJECT_MEMBER_ADDED: "users",
};

type NotificationTab = "all" | "unread";

export default function NotificationsRoute() {
  const { t, i18n } = useTranslation();
  const { notifications, unreadCount } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const markReadFetcher = useFetcher();
  const [tab, setTab] = useState<NotificationTab>("all");

  function actionText(type: NotificationType): string {
    switch (type) {
      case "TASK_ASSIGNED":
        return t("notifications.type_task_assigned");
      case "TASK_COMMENTED":
        return t("notifications.type_task_commented");
      case "TASK_APPROVED":
        return t("notifications.type_task_approved");
      case "TASK_REJECTED":
        return t("notifications.type_task_rejected");
      case "TASK_REOPENED":
        return t("notifications.type_task_reopened");
      case "PROJECT_MEMBER_ADDED":
        return t("notifications.type_project_member_added");
    }
  }

  const items = notifications.items.filter((n: NotificationDto) => tab === "all" || n.readAt === null);

  /** Opening a notification marks it read (FR-25 c2) and goes to its task or project (c3). */
  const open = (n: NotificationDto) => {
    if (n.readAt === null) {
      void markReadFetcher.submit({ intent: "markRead", notificationId: n.id }, { method: "post" });
    }
    void navigate(n.targetUrl);
  };

  return (
    <Page
      maxWidth={760}
      header={
        <PageHeader
          title={<span data-testid="notification-center-title">{t("notifications.title")}</span>}
          description={
            <>
              {t("notifications.subtitle_prefix")} <span data-testid="unread-count">{unreadCount}</span>{" "}
              {unreadCount === 1 ? t("notifications.subtitle_unread") : t("notifications.subtitle_unread_plural")}
            </>
          }
          actions={
            <Form method="post">
              <input type="hidden" name="intent" value="markAllRead" />
              <Button type="submit" size="sm" icon="check" disabled={unreadCount === 0} data-testid="mark-all-read-btn">
                {t("notifications.btn_mark_all_read")}
              </Button>
            </Form>
          }
          tabs={
            <Tabs
              value={tab}
              onChange={(id) => {
                setTab(id === "unread" ? "unread" : "all");
              }}
              label={t("notifications.title")}
              items={[
                { id: "all", label: t("notifications.tab_all"), count: notifications.total, "data-testid": "tab-all" },
                { id: "unread", label: t("notifications.tab_unread"), count: unreadCount, "data-testid": "tab-unread" },
              ]}
            />
          }
        />
      }
    >
      {items.length === 0 ? (
        tab === "unread" ? (
          <EmptyState
            icon="bell"
            title={t("notifications.caught_up_title")}
            description={t("notifications.caught_up_desc")}
            data-testid="no-notifications-msg"
          />
        ) : (
          <EmptyState icon="bell" title={t("notifications.empty")} data-testid="no-notifications-msg" />
        )
      ) : (
        <ul
          className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-line bg-surface p-0"
          data-testid="notifications-list"
        >
          {items.map((n: NotificationDto) => {
            const isUnread = n.readAt === null;
            return (
              <li key={n.id} data-testid={`notification-item-${n.id}`} className="border-b border-line last:border-b-0">
                <a
                  href={n.targetUrl}
                  onClick={(event) => {
                    event.preventDefault();
                    open(n);
                  }}
                  data-testid={`notification-link-${n.id}`}
                  className={cx(
                    "flex gap-3 px-4 py-3 no-underline hover:bg-hover hover:no-underline",
                    isUnread ? "bg-surface" : "bg-subtle",
                  )}
                >
                  <span className="w-2 shrink-0 pt-[7px]">
                    {isUnread ? (
                      <span className="block size-[7px] rounded-full bg-accent" data-testid={`unread-dot-${n.id}`} />
                    ) : null}
                  </span>
                  <span className="relative shrink-0">
                    <Avatar name={n.payload.actorName} size={28} />
                    <span className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-raised text-fg-secondary shadow-[0_0_0_1px_var(--border)]">
                      <Icon name={NOTIFICATION_ICON[n.type]} size={10} />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[13px] leading-[1.4] text-fg-secondary">
                      <span className="font-medium text-fg">{n.payload.actorName}</span> {actionText(n.type)}
                    </span>
                    <span className="truncate text-[13px] font-medium leading-[1.3] text-fg">{n.payload.title}</span>
                    {n.payload.reason ? (
                      <span
                        className="mt-0.5 rounded-md bg-subtle px-2.5 py-1.5 text-[12.5px] leading-[1.4] text-fg-secondary"
                        data-testid={`notification-reason-${n.id}`}
                      >
                        {t("notifications.reason_label")} {n.payload.reason}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="whitespace-nowrap pt-[3px] text-[12px] leading-none text-fg-muted"
                    suppressHydrationWarning
                  >
                    {formatRelativeTime(n.createdAt, i18n.language)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
