import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSubmit } from "react-router";

import {
  APP_NAME,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AdminAuditLogLoaderData,
  type AuditLogRow,
} from "@pm/domain";

import { Avatar } from "../components/ui/Avatar";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button, buttonClass } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Page, Toolbar } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table } from "../components/ui/Table";
import { adminAuditLogLoader } from "../loaders/adminAuditLogLoader";
import { extractAuditDiffs, formatAuditTimestamp } from "../utils/formatAudit";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Audit log — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminAuditLogLoader(ctx, request);
}

function buildPageHref(filters: AdminAuditLogLoaderData["filters"], targetPage: number): string {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(targetPage));
  return `/admin/audit-log?${params.toString()}`;
}

/** Destructive actions read red, creations and approvals green, everything else neutral. */
function actionTone(action: string): BadgeTone {
  if (/REJECTED|LOCKED|DELETED|REMOVED|ARCHIVED/.test(action)) return "danger";
  if (/APPROVED|CREATED|ADDED/.test(action)) return "done";
  return "neutral";
}

export default function AdminAuditLogPage() {
  const { t } = useTranslation();
  const submit = useSubmit();
  const { entries, filters, actors } = useLoaderData<typeof loader>();
  const startItem = entries.total === 0 ? 0 : (entries.page - 1) * entries.pageSize + 1;
  const endItem = Math.min(entries.page * entries.pageSize, entries.total);
  const hasFilters = Boolean(filters.actorId || filters.entityType || filters.action || filters.from || filters.to);

  return (
    <Page
      maxWidth={1200}
      header={
        <PageHeader
          eyebrow={t("nav.management")}
          title={t("admin_audit.title")}
          description={t("admin_audit.subtitle")}
        />
      }
    >
      <Form
        method="get"
        data-testid="audit-filter-form"
        onChange={(event) => {
          void submit(event.currentTarget, { replace: true });
        }}
      >
        <Toolbar>
          <Select
            id="audit-filter-actor"
            size="sm"
            name="actorId"
            aria-label={t("admin_audit.label_actor")}
            defaultValue={filters.actorId ?? ""}
            placeholder={t("admin_audit.all_actors")}
            options={actors.map((actor) => ({
              value: actor.id,
              label: actor.isDeleted ? t("admin_audit.deleted_user") : `${actor.fullName} (${actor.email})`,
            }))}
            className="w-[200px]"
            data-testid="filter-actor"
          />
          <Select
            id="audit-filter-entity-type"
            size="sm"
            name="entityType"
            aria-label={t("admin_audit.label_entity_type")}
            defaultValue={filters.entityType ?? ""}
            placeholder={t("admin_audit.all_entity_types")}
            options={AUDIT_ENTITY_TYPES.map((type) => ({ value: type, label: type }))}
            className="w-[180px]"
            data-testid="filter-entity-type"
          />
          <Select
            id="audit-filter-action"
            size="sm"
            name="action"
            aria-label={t("admin_audit.label_action")}
            defaultValue={filters.action ?? ""}
            placeholder={t("admin_audit.all_actions")}
            options={AUDIT_ACTIONS.map((action) => ({ value: action, label: action }))}
            className="w-[200px]"
            data-testid="filter-action"
          />
          <Input
            size="sm"
            type="date"
            name="from"
            aria-label={t("admin_audit.label_from_date")}
            title={t("admin_audit.label_from_date")}
            defaultValue={filters.from ?? ""}
            className="w-[150px]"
            data-testid="filter-from"
          />
          <span className="text-fg-muted">→</span>
          <Input
            size="sm"
            type="date"
            name="to"
            aria-label={t("admin_audit.label_to_date")}
            title={t("admin_audit.label_to_date")}
            defaultValue={filters.to ?? ""}
            className="w-[150px]"
            data-testid="filter-to"
          />
          {hasFilters ? (
            <Link to="/admin/audit-log" className={buttonClass("ghost", "sm")} data-testid="btn-reset-audit-filters">
              {t("admin_audit.btn_reset")}
            </Link>
          ) : null}
        </Toolbar>
      </Form>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <Table<AuditLogRow>
          data-testid="audit-log-table"
          rows={entries.items}
          rowKey={(row) => row.id}
          rowTestId={() => "audit-log-row"}
          empty={<span data-testid="audit-empty-state">{t("admin_audit.empty_audit")}</span>}
          columns={[
            {
              id: "timestamp",
              label: t("admin_audit.th_timestamp"),
              muted: true,
              width: 150,
              render: (row) => <span className="tabular-nums">{formatAuditTimestamp(row.createdAt)}</span>,
            },
            {
              id: "actor",
              label: t("admin_audit.th_actor"),
              render: (row) => (
                <span className="inline-flex items-center gap-2">
                  <Avatar name={row.actorName} size={20} />
                  {row.actorName}
                </span>
              ),
            },
            {
              id: "action",
              label: t("admin_audit.th_action"),
              render: (row) => (
                <Badge tone={actionTone(row.action)} size="sm" className="font-mono">
                  {row.action}
                </Badge>
              ),
            },
            {
              id: "entity",
              label: t("admin_audit.th_entity"),
              render: (row) => (
                <span className="flex flex-col gap-[3px]">
                  <span className="max-w-[220px] truncate font-mono text-[12px] font-medium">{row.entityId}</span>
                  <span className="text-[11.5px] leading-none text-fg-muted">
                    {row.entityType}
                    {row.projectCode ? ` · ${t("admin_audit.project_prefix", { code: row.projectCode })}` : ""}
                  </span>
                </span>
              ),
            },
            {
              id: "changes",
              label: t("admin_audit.th_changes"),
              wrap: true,
              render: (row) => {
                const { reason, diffs } = extractAuditDiffs(row.changes);
                return (
                  <span className="flex flex-col gap-[3px] py-1.5">
                    {diffs.length === 0 && !reason ? <span className="text-fg-muted">—</span> : null}
                    {diffs.map((diff) => (
                      <span key={diff.field} className="font-mono text-[12.5px] leading-[1.3]">
                        {`${diff.field}: ${diff.fromText} → ${diff.toText}`}
                      </span>
                    ))}
                    {reason ? (
                      <span className="text-[12px] leading-[1.35] text-fg-muted">
                        {t("admin_audit.reason_prefix")} {reason}
                      </span>
                    ) : null}
                  </span>
                );
              },
            },
          ]}
        />
        <div
          className="flex items-center justify-between border-t border-line px-3 py-2.5 text-[12px] leading-none text-fg-muted"
          data-testid="audit-pagination"
        >
          <span>
            {t("admin_audit.pagination_showing", {
              start: startItem,
              end: endItem,
              total: entries.total,
              pageSize: entries.pageSize,
            })}
          </span>
          <span className="flex items-center gap-1.5">
            {entries.page > 1 ? (
              <Link
                to={buildPageHref(filters, entries.page - 1)}
                className={buttonClass("secondary", "sm")}
                data-testid="audit-prev-page"
              >
                {t("admin_audit.btn_previous")}
              </Link>
            ) : (
              <Button size="sm" disabled>
                {t("admin_audit.btn_previous")}
              </Button>
            )}
            <span className="px-1">
              {t("admin_audit.pagination_page", { page: entries.page, totalPages: entries.totalPages })}
            </span>
            {entries.page < entries.totalPages ? (
              <Link
                to={buildPageHref(filters, entries.page + 1)}
                className={buttonClass("secondary", "sm")}
                data-testid="audit-next-page"
              >
                {t("admin_audit.btn_next")}
              </Link>
            ) : (
              <Button size="sm" disabled>
                {t("admin_audit.btn_next")}
              </Button>
            )}
          </span>
        </div>
      </div>
    </Page>
  );
}
