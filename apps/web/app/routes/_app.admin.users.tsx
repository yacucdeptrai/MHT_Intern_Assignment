import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams, useSubmit } from "react-router";

import { APP_NAME, SYSTEM_ROLES, type SystemRole, type UserAdminRow } from "@pm/domain";

import { adminUsersAction } from "../actions/adminUsersAction";
import { Avatar } from "../components/ui/Avatar";
import { Badge, roleTone } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/cx";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { MenuButton } from "../components/ui/Menu";
import { Page, Toolbar } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table } from "../components/ui/Table";
import { translateRole } from "../i18n/labels";
import { adminUsersLoader } from "../loaders/adminUsersLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Users — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminUsersLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminUsersAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
  inviteUrl?: string;
  user?: UserAdminRow;
}

/** System roles from least to most privileged, as the create form lists them. */
const ROLE_ORDER: SystemRole[] = ["MEMBER", "TEAM_LEAD", "PM", "ADMIN"];

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSubmitting = navigation.state === "submitting";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAdminRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAdminRow | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [prevActionData, setPrevActionData] = useState(actionData);

  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsCreateOpen(false);
      setEditingUser(null);
    }
  }

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const createEmailError = actionData?.errors?.email?.[0];
  const createNameError = actionData?.errors?.fullName?.[0];
  // The create dialog stays open after a failed submit, keeping what was typed.
  const isCreateError = isCreateOpen && Boolean(actionData && !actionData.success);
  const roleOptions = ROLE_ORDER.filter((role) => SYSTEM_ROLES.includes(role)).map((role) => ({
    value: role,
    label: translateRole(t, role),
  }));

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
      }, 2000);
    } catch {
      // Clipboard can be unavailable (permissions); the link stays visible to copy by hand.
    }
  };

  const runIntent = (intent: "lock" | "unlock" | "delete", user: UserAdminRow) => {
    void submit({ intent, userId: user.id }, { method: "post" });
  };

  const users = loaderData.users.items;

  return (
    <Page
      header={
        <PageHeader
          eyebrow={t("nav.management")}
          title={t("admin_users.title")}
          description={t("admin_users.subtitle")}
          meta={<Badge data-testid="users-total">{loaderData.users.total}</Badge>}
          actions={
            <Button
              variant="primary"
              size="sm"
              icon="user-plus"
              onClick={() => {
                setIsCreateOpen(true);
              }}
              data-testid="btn-open-create-user"
            >
              {t("admin_users.btn_create_user")}
            </Button>
          }
        />
      }
    >
      {formError && !isCreateError && !editingUser ? (
        <Banner tone="danger" role="alert">
          {formError}
        </Banner>
      ) : null}

      {actionData?.success && actionData.inviteUrl ? (
        <Banner
          tone="success"
          title={t("admin_users.success_created_title")}
          action={
            <Button
              size="sm"
              icon="copy"
              onClick={() => {
                void handleCopyLink(actionData.inviteUrl ?? "");
              }}
            >
              {copiedLink ? t("admin_users.btn_copied") : t("admin_users.btn_copy_link")}
            </Button>
          }
        >
          <span className="flex flex-col gap-2">
            {t("admin_users.success_created_desc")}
            <Input readOnly value={actionData.inviteUrl} className="font-mono text-[12px]" />
          </span>
        </Banner>
      ) : null}

      <Form
        method="get"
        onChange={(event) => {
          const form = event.currentTarget;
          if (searchTimer.current) {
            clearTimeout(searchTimer.current);
          }
          // Debounce typing in the search box; selects apply immediately.
          searchTimer.current = setTimeout(
            () => {
              void submit(form, { replace: true });
            },
            (event.target as HTMLElement).tagName === "INPUT" ? 300 : 0,
          );
        }}
      >
        <Toolbar>
          <Input
            size="sm"
            icon="search"
            type="search"
            name="q"
            aria-label={t("admin_users.search_placeholder")}
            placeholder={t("admin_users.search_placeholder")}
            defaultValue={searchParams.get("q") ?? ""}
            className="w-[260px]"
            data-testid="users-search"
          />
          <Select
            size="sm"
            name="status"
            aria-label={t("admin_users.th_status")}
            defaultValue={searchParams.get("status") ?? ""}
            placeholder={t("admin_users.filter_all_statuses")}
            options={[
              { value: "ACTIVE", label: t("admin_users.status_active") },
              { value: "LOCKED", label: t("admin_users.status_locked") },
            ]}
            className="w-[140px]"
          />
          <Select
            size="sm"
            name="systemRole"
            aria-label={t("admin_users.th_role")}
            defaultValue={searchParams.get("systemRole") ?? ""}
            placeholder={t("admin_users.filter_all_roles")}
            options={[...ROLE_ORDER].reverse().map((role) => ({ value: role, label: translateRole(t, role) }))}
            className="w-[140px]"
          />
        </Toolbar>
      </Form>

      <div className="rounded-lg border border-line bg-surface">
        <Table<UserAdminRow>
          data-testid="users-table"
          rows={users}
          rowKey={(row) => row.id}
          rowTestId={(row) => `user-row-${row.id}`}
          empty={t("admin_users.no_users_found")}
          columns={[
            {
              id: "name",
              label: t("admin_users.th_full_name"),
              render: (row) => (
                <span
                  className={cx(
                    "inline-flex items-center gap-2.5 font-medium",
                    row.status === "LOCKED" && "opacity-55",
                  )}
                >
                  <Avatar name={row.fullName} src={row.avatarKey ? `/api/avatars/${row.id}` : null} size={24} />
                  {row.fullName}
                </span>
              ),
            },
            { id: "email", label: t("admin_users.th_email"), muted: true, render: (row) => row.email },
            {
              id: "role",
              label: t("admin_users.th_role"),
              render: (row) => (
                <Badge tone={roleTone(row.systemRole)} size="sm">
                  {translateRole(t, row.systemRole)}
                </Badge>
              ),
            },
            {
              id: "department",
              label: t("admin_users.th_department"),
              muted: true,
              render: (row) => row.department ?? "—",
            },
            {
              id: "status",
              label: t("admin_users.th_status"),
              render: (row) =>
                row.status === "ACTIVE" ? (
                  <Badge tone="done" dot size="sm" data-testid={`user-status-${row.id}`}>
                    {t("admin_users.status_active")}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon="circle-pause" size="sm" data-testid={`user-status-${row.id}`}>
                    {t("admin_users.status_locked")}
                  </Badge>
                ),
            },
            {
              id: "actions",
              label: "",
              align: "right",
              width: 48,
              render: (row) => (
                <MenuButton
                  label={t("admin_users.actions_label")}
                  data-testid={`user-actions-${row.id}`}
                  items={[
                    {
                      id: "edit",
                      label: t("admin_users.btn_edit"),
                      icon: "pencil",
                      onSelect: () => {
                        setEditingUser(row);
                      },
                    },
                    {
                      id: "role",
                      label: t("admin_users.btn_change_role"),
                      icon: "users",
                      onSelect: () => {
                        setEditingUser(row);
                      },
                    },
                    row.status === "ACTIVE"
                      ? {
                          id: "lock",
                          label: t("admin_users.btn_lock"),
                          icon: "circle-pause",
                          disabled: isSubmitting,
                          onSelect: () => {
                            runIntent("lock", row);
                          },
                          "data-testid": `btn-toggle-status-${row.id}`,
                        }
                      : {
                          id: "unlock",
                          label: t("admin_users.btn_unlock"),
                          icon: "rotate-ccw",
                          disabled: isSubmitting,
                          onSelect: () => {
                            runIntent("unlock", row);
                          },
                          "data-testid": `btn-toggle-status-${row.id}`,
                        },
                    { id: "divider", label: "", divider: true },
                    {
                      id: "delete",
                      label: t("admin_users.btn_delete"),
                      icon: "trash-2",
                      danger: true,
                      onSelect: () => {
                        setDeletingUser(row);
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
        }}
        title={t("admin_users.modal_create_title")}
        description={t("admin_users.modal_create_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setIsCreateOpen(false);
              }}
            >
              {t("admin_users.btn_cancel")}
            </Button>
            <Button
              type="submit"
              form="create-user-form"
              variant="primary"
              disabled={isSubmitting}
              data-testid="btn-submit-create-user"
            >
              {isSubmitting ? t("admin_users.btn_creating") : t("admin_users.btn_submit_create")}
            </Button>
          </>
        }
      >
        <Form id="create-user-form" method="post" className="flex flex-col gap-3.5">
          <input type="hidden" name="intent" value="create" />
          {formError && isCreateError && !createEmailError && !createNameError ? (
            <Banner tone="danger" role="alert">
              {formError}
            </Banner>
          ) : null}
          <Input
            id="create-fullName"
            name="fullName"
            required
            label={t("admin_users.label_full_name")}
            placeholder={t("admin_users.placeholder_full_name")}
            defaultValue={isCreateError ? (actionData?.values?.fullName ?? "") : ""}
            error={createNameError}
          />
          <Input
            id="create-email"
            name="email"
            type="email"
            required
            label={t("admin_users.label_email")}
            placeholder={t("admin_users.placeholder_email")}
            defaultValue={isCreateError ? (actionData?.values?.email ?? "") : ""}
            error={createEmailError ? <span data-testid="error-create-email">{createEmailError}</span> : undefined}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              id="create-systemRole"
              name="systemRole"
              label={t("admin_users.label_system_role")}
              defaultValue={isCreateError ? (actionData?.values?.systemRole ?? "MEMBER") : "MEMBER"}
              options={roleOptions}
            />
            <Input
              id="create-department"
              name="department"
              label={t("admin_users.label_department")}
              hint={t("admin_users.hint_optional")}
              defaultValue={isCreateError ? (actionData?.values?.department ?? "") : ""}
            />
          </div>
        </Form>
      </Dialog>

      <Dialog
        open={editingUser !== null}
        onClose={() => {
          setEditingUser(null);
        }}
        title={editingUser ? t("admin_users.modal_edit_title", { name: editingUser.fullName }) : ""}
        footer={
          <>
            <Button
              onClick={() => {
                setEditingUser(null);
              }}
            >
              {t("admin_users.btn_cancel")}
            </Button>
            <Button type="submit" form="edit-user-form" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t("admin_users.btn_saving") : t("admin_users.btn_save_changes")}
            </Button>
          </>
        }
      >
        {editingUser ? (
          <Form id="edit-user-form" method="post" className="flex flex-col gap-3.5">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="userId" value={editingUser.id} />
            {formError ? (
              <Banner tone="danger" role="alert">
                {formError}
              </Banner>
            ) : null}
            <Input
              id="edit-fullName"
              name="fullName"
              required
              label={t("admin_users.label_full_name")}
              defaultValue={editingUser.fullName}
            />
            <Input
              id="edit-email"
              name="email"
              type="email"
              required
              label={t("admin_users.label_email")}
              defaultValue={editingUser.email}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                id="edit-systemRole"
                name="systemRole"
                label={t("admin_users.label_system_role")}
                defaultValue={editingUser.systemRole}
                options={roleOptions}
              />
              <Input
                id="edit-department"
                name="department"
                label={t("admin_users.label_department")}
                defaultValue={editingUser.department ?? ""}
              />
            </div>
          </Form>
        ) : null}
      </Dialog>

      <Dialog
        open={deletingUser !== null}
        onClose={() => {
          setDeletingUser(null);
        }}
        title={deletingUser ? t("admin_users.delete_title", { name: deletingUser.fullName }) : ""}
        description={t("admin_users.delete_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setDeletingUser(null);
              }}
            >
              {t("admin_users.btn_cancel")}
            </Button>
            <Button
              variant="danger"
              icon="trash-2"
              data-testid="confirm-delete-user-btn"
              onClick={() => {
                if (deletingUser) {
                  runIntent("delete", deletingUser);
                }
                setDeletingUser(null);
              }}
            >
              {t("admin_users.btn_delete")}
            </Button>
          </>
        }
      />
    </Page>
  );
}
