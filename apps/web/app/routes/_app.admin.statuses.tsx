import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import { APP_NAME, STATUS_CATEGORIES, type StatusCategory } from "@pm/domain";

import { adminStatusesAction } from "../actions/adminStatusesAction";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { IconButton } from "../components/ui/IconButton";
import { Input } from "../components/ui/Input";
import { Page, Panel } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { StatusIcon, statusGlyph } from "../components/ui/TaskIcons";
import { translateCategory } from "../i18n/labels";
import { adminStatusesLoader, type StatusAdminRow } from "../loaders/adminStatusesLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Task statuses — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminStatusesLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminStatusesAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
  status?: StatusAdminRow;
}

export default function AdminStatusesPage() {
  const { t } = useTranslation();
  const { statuses } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusAdminRow | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<StatusAdminRow | null>(null);
  const [prevActionData, setPrevActionData] = useState(actionData);
  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsCreateOpen(false);
      setEditingStatus(null);
    }
  }

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const nameError = actionData?.errors?.name?.[0];
  const categoryError = actionData?.errors?.category?.[0];

  /** Moves a status one place within its category and saves the full order. */
  const move = (status: StatusAdminRow, direction: -1 | 1) => {
    const siblings = statuses.filter((item) => item.category === status.category);
    const index = siblings.findIndex((item) => item.id === status.id);
    const target = siblings[index + direction];
    if (!target) return;
    const order = statuses.map((item) => item.id);
    const from = order.indexOf(status.id);
    const to = order.indexOf(target.id);
    order[from] = target.id;
    order[to] = status.id;
    const formData = new FormData();
    formData.set("intent", "reorder");
    for (const id of order) {
      formData.append("orderedIds", id);
    }
    void submit(formData, { method: "post" });
  };

  const post = (intent: "setDefault" | "delete", status: StatusAdminRow) => {
    void submit({ intent, statusId: status.id }, { method: "post" });
  };

  return (
    <Page
      maxWidth={900}
      header={
        <PageHeader
          eyebrow={t("nav.management")}
          title={t("admin_statuses.title")}
          description={t("admin_statuses.subtitle")}
          actions={
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => {
                setIsCreateOpen(true);
              }}
              data-testid="btn-add-status"
            >
              {t("admin_statuses.btn_add_status")}
            </Button>
          }
        />
      }
    >
      <Banner tone="info" title={t("admin_statuses.info_title")}>
        {t("admin_statuses.info_body")}
      </Banner>

      {formError && !isCreateOpen && !editingStatus ? (
        <Banner tone="danger" role="alert">
          {formError}
        </Banner>
      ) : null}

      {STATUS_CATEGORIES.map((category: StatusCategory) => {
        const rows = statuses.filter((status) => status.category === category);
        return (
          <Panel
            key={category}
            title={
              <>
                <StatusIcon category={category} />
                {translateCategory(t, category)}
              </>
            }
            count={rows.length}
            data-testid={`status-group-${category}`}
          >
            {rows.map((status, index) => {
              const isInUse = status.taskCount > 0;
              return (
                <div
                  key={status.id}
                  className="flex h-11 items-center gap-3 border-b border-line pl-4 pr-3 last:border-b-0"
                  data-testid={`status-row-${status.id}`}
                >
                  <span className="flex flex-col">
                    <IconButton
                      icon="chevron-down"
                      label={t("admin_statuses.aria_move_up")}
                      size="xs"
                      className="!h-3.5 rotate-180"
                      disabled={index === 0 || isSubmitting}
                      onClick={() => {
                        move(status, -1);
                      }}
                    />
                    <IconButton
                      icon="chevron-down"
                      label={t("admin_statuses.aria_move_down")}
                      size="xs"
                      className="!h-3.5"
                      disabled={index === rows.length - 1 || isSubmitting}
                      onClick={() => {
                        move(status, 1);
                      }}
                    />
                  </span>
                  <StatusIcon category={statusGlyph(status.name, status.category)} />
                  <span className="min-w-[120px] text-[13px] font-medium leading-none text-fg">{status.name}</span>
                  {status.isDefault ? (
                    <Badge tone="accent" size="sm">
                      {t("admin_statuses.badge_default")}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => {
                        post("setDefault", status);
                      }}
                    >
                      {t("admin_statuses.btn_set_default")}
                    </Button>
                  )}
                  <span className="flex-1" />
                  <span className="w-[70px] text-right text-[12px] leading-none text-fg-muted">
                    {t("admin_statuses.task_count", { count: status.taskCount })}
                  </span>
                  <IconButton
                    icon="pencil"
                    label={t("admin_statuses.btn_edit")}
                    size="xs"
                    onClick={() => {
                      setEditingStatus(status);
                    }}
                  />
                  <IconButton
                    icon="trash-2"
                    label={isInUse ? t("admin_statuses.delete_in_use") : t("admin_statuses.btn_delete")}
                    size="xs"
                    disabled={isInUse || status.isDefault || isSubmitting}
                    onClick={() => {
                      setDeletingStatus(status);
                    }}
                  />
                </div>
              );
            })}
          </Panel>
        );
      })}

      <Dialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
        }}
        title={t("admin_statuses.modal_add_title")}
        footer={
          <>
            <Button
              onClick={() => {
                setIsCreateOpen(false);
              }}
            >
              {t("admin_statuses.btn_cancel")}
            </Button>
            <Button type="submit" form="create-status-form" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t("admin_statuses.btn_saving") : t("admin_statuses.btn_create")}
            </Button>
          </>
        }
      >
        <Form id="create-status-form" method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="create" />
          {formError && !nameError && !categoryError ? (
            <Banner tone="danger" role="alert">
              {formError}
            </Banner>
          ) : null}
          <Input
            id="create-status-name"
            name="name"
            required
            label={t("admin_statuses.label_status_name")}
            placeholder={t("admin_statuses.placeholder_name")}
            defaultValue={actionData?.values?.name ?? ""}
            error={nameError}
          />
          <Select
            id="create-status-category"
            name="category"
            label={t("admin_statuses.label_category")}
            defaultValue={actionData?.values?.category ?? "IN_PROGRESS"}
            options={STATUS_CATEGORIES.map((category) => ({ value: category, label: translateCategory(t, category) }))}
            error={categoryError}
          />
        </Form>
      </Dialog>

      <Dialog
        open={editingStatus !== null}
        onClose={() => {
          setEditingStatus(null);
        }}
        title={t("admin_statuses.modal_edit_title")}
        footer={
          <>
            <Button
              onClick={() => {
                setEditingStatus(null);
              }}
            >
              {t("admin_statuses.btn_cancel")}
            </Button>
            <Button type="submit" form="edit-status-form" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t("admin_statuses.btn_saving") : t("admin_statuses.btn_update")}
            </Button>
          </>
        }
      >
        {editingStatus ? (
          <Form id="edit-status-form" method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="statusId" value={editingStatus.id} />
            <Input
              id="edit-status-name"
              name="name"
              required
              label={t("admin_statuses.label_status_name")}
              defaultValue={editingStatus.name}
              error={nameError}
            />
          </Form>
        ) : null}
      </Dialog>

      <Dialog
        open={deletingStatus !== null}
        onClose={() => {
          setDeletingStatus(null);
        }}
        title={deletingStatus ? t("admin_statuses.delete_title", { name: deletingStatus.name }) : ""}
        description={t("admin_statuses.delete_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setDeletingStatus(null);
              }}
            >
              {t("admin_statuses.btn_cancel")}
            </Button>
            <Button
              variant="danger"
              icon="trash-2"
              onClick={() => {
                if (deletingStatus) {
                  post("delete", deletingStatus);
                }
                setDeletingStatus(null);
              }}
            >
              {t("admin_statuses.btn_delete")}
            </Button>
          </>
        }
      />
    </Page>
  );
}
