import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRouteLoaderData,
  useSubmit,
} from "react-router";

import { APP_NAME, PROJECT_ROLES, type InviteRow, type MemberRow, type ProjectRole } from "@pm/domain";

import { projectMembersAction } from "../actions/projectMembersAction";
import { Avatar } from "../components/ui/Avatar";
import { Badge, roleTone } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Panel } from "../components/ui/Page";
import { Select } from "../components/ui/Select";
import { Table } from "../components/ui/Table";
import { translateRole } from "../i18n/labels";
import { projectMembersLoader, type UserSearchItem } from "../loaders/projectMembersLoader";
import { formatShortDate } from "../utils/format";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Members — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectMembersLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectMembersAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  inviteUrl?: string;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function ProjectMembersPage() {
  const { t, i18n } = useTranslation();
  const { members, pendingInvites, permissions, isArchived } = useLoaderData<typeof loader>();
  const appData = useRouteLoaderData<{ user: { id: string } }>("routes/_app");
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const searchFetcher = useFetcher<{ searchResults?: UserSearchItem[] }>();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [addRole, setAddRole] = useState<ProjectRole>("MEMBER");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("MEMBER");
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  // Re-mount role selects after each action so a rejected change (e.g. last PM) snaps back.
  const [actionCount, setActionCount] = useState(0);
  const [prevActionData, setPrevActionData] = useState(actionData);
  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    setActionCount((count) => count + 1);
  }

  const isSubmitting = navigation.state === "submitting";
  const canManage = permissions.canManageMembers && !isArchived;
  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const userError = actionData?.errors?.userId?.[0];
  const emailError = actionData?.errors?.email?.[0];
  const searchResults = searchFetcher.data?.searchResults ?? [];
  const shortDate = (value: Date | string) => formatShortDate(new Date(value), i18n.language);
  // The last PM cannot be removed (server rule), so their row has no Remove button.
  const pmCount = members.filter((member) => member.projectRole === "PM").length;
  const roleOptions = PROJECT_ROLES.map((role) => ({ value: role, label: translateRole(t, role) }));

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    void searchFetcher.load(`?q=${encodeURIComponent(query)}`);
  };

  const handleCopyInviteUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="project-members-page">
      {isArchived ? <Banner tone="warning">{t("project_members.archived_banner")}</Banner> : null}

      {actionData?.success && !actionData.inviteUrl ? (
        <Banner tone="success" data-testid="success-banner">
          {t("project_members.success_banner")}
        </Banner>
      ) : null}

      {actionData?.inviteUrl ? (
        <Banner
          tone="success"
          title={t("project_members.invite_url_title")}
          data-testid="invite-url-box"
          action={
            <Button
              size="sm"
              icon="copy"
              onClick={() => {
                handleCopyInviteUrl(actionData.inviteUrl ?? "");
              }}
              data-testid="copy-invite-url-btn"
            >
              {copied ? t("project_members.btn_copied") : t("project_members.btn_copy")}
            </Button>
          }
        >
          <span className="flex flex-col gap-2">
            {t("project_members.invite_url_desc")}
            <Input
              readOnly
              value={actionData.inviteUrl}
              className="font-mono text-[12px]"
              data-testid="invite-url-link"
            />
          </span>
        </Banner>
      ) : null}

      {formError ? (
        <Banner tone="danger" role="alert" data-testid="action-error">
          {formError}
        </Banner>
      ) : null}

      {canManage ? (
        <Panel title={t("project_members.add_title")} subtitle={t("project_members.add_subtitle")}>
          <div className="flex flex-col gap-4 p-4">
            <Form
              method="post"
              className="grid items-end gap-2.5"
              style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 160px auto" }}
              data-testid="add-member-form"
            >
              <input type="hidden" name="intent" value="add" />
              <Input
                id="searchQuery"
                icon="search"
                label={t("project_members.search_users_label")}
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={t("project_members.search_placeholder")}
                data-testid="search-user-input"
              />
              <Select
                id="userId"
                name="userId"
                label={t("project_members.select_user_label")}
                value={selectedUserId}
                onChange={(event) => {
                  setSelectedUserId(event.target.value);
                }}
                placeholder={
                  searchFetcher.state === "loading"
                    ? t("project_members.searching")
                    : searchQuery.trim() && searchResults.length === 0
                      ? t("project_members.no_users_found")
                      : t("project_members.choose_user_option")
                }
                options={searchResults.map((user) => ({ value: user.id, label: `${user.fullName} (${user.email})` }))}
                error={userError}
                data-testid="search-user-select"
              />
              <Select
                id="addRole"
                name="projectRole"
                label={t("project_members.project_role_label")}
                value={addRole}
                onChange={(event) => {
                  setAddRole(event.target.value as ProjectRole);
                }}
                options={roleOptions}
                data-testid="add-member-role-select"
              />
              <Button
                type="submit"
                variant="secondary"
                icon="user-plus"
                disabled={isSubmitting || !selectedUserId}
                data-testid="add-member-submit-btn"
              >
                {t("project_members.btn_add")}
              </Button>
            </Form>
            <Form
              method="post"
              className="grid items-end gap-2.5"
              style={{ gridTemplateColumns: "minmax(0,1fr) 160px auto" }}
              data-testid="invite-member-form"
            >
              <input type="hidden" name="intent" value="invite" />
              <Input
                id="inviteEmail"
                name="email"
                type="email"
                required
                requiredMark={false}
                label={t("project_members.invite_email_label")}
                placeholder={t("project_members.invite_email_placeholder")}
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                }}
                error={emailError}
                data-testid="invite-email-input"
              />
              <Select
                id="inviteRole"
                name="projectRole"
                label={t("project_members.project_role_label")}
                value={inviteRole}
                onChange={(event) => {
                  setInviteRole(event.target.value as ProjectRole);
                }}
                options={roleOptions}
                data-testid="invite-role-select"
              />
              <Button
                type="submit"
                variant="primary"
                icon="user-plus"
                disabled={isSubmitting}
                data-testid="invite-submit-btn"
              >
                {isSubmitting ? t("project_members.btn_inviting") : t("project_members.btn_invite")}
              </Button>
            </Form>
          </div>
        </Panel>
      ) : (
        <Banner tone="info">{t("project_members.only_pm_banner")}</Banner>
      )}

      <Panel title={t("project_members.members_title")} count={members.length}>
        <Table<MemberRow>
          data-testid="members-table"
          rows={members}
          rowKey={(row) => row.userId}
          rowTestId={(row) => `member-row-${row.userId}`}
          columns={[
            {
              id: "member",
              label: t("project_members.th_member"),
              render: (row) => (
                <span className="inline-flex items-center gap-2.5">
                  <Avatar name={row.fullName} src={row.avatarKey ? `/api/avatars/${row.userId}` : null} size={24} />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium" data-testid={`member-name-${row.userId}`}>
                      {row.fullName}
                      {row.userId === appData?.user.id ? (
                        <span className="font-normal text-fg-muted">{` ${t("project_members.you")}`}</span>
                      ) : null}
                    </span>
                    <span className="text-[11.5px] leading-none text-fg-muted">{row.email}</span>
                  </span>
                </span>
              ),
            },
            {
              id: "role",
              label: t("project_members.th_role"),
              width: 170,
              render: (row) =>
                canManage ? (
                  <Select
                    key={`${row.projectRole}-${String(actionCount)}`}
                    size="sm"
                    name="projectRole"
                    aria-label={t("project_members.th_role")}
                    defaultValue={row.projectRole}
                    options={roleOptions}
                    onChange={(event) => {
                      void submit(
                        { intent: "changeRole", userId: row.userId, projectRole: event.target.value },
                        { method: "post" },
                      );
                    }}
                    data-testid={`member-role-select-${row.userId}`}
                  />
                ) : (
                  <Badge tone={roleTone(row.projectRole)} data-testid={`member-role-${row.userId}`}>
                    {translateRole(t, row.projectRole)}
                  </Badge>
                ),
            },
            {
              id: "joined",
              label: t("project_members.th_joined"),
              muted: true,
              render: (row) => shortDate(row.createdAt),
            },
            {
              id: "actions",
              label: "",
              align: "right",
              render: (row) =>
                canManage && !(row.projectRole === "PM" && pmCount <= 1) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRemoving(row);
                    }}
                    data-testid={`remove-member-btn-${row.userId}`}
                  >
                    {t("project_members.btn_remove")}
                  </Button>
                ) : null,
            },
          ]}
        />
      </Panel>

      {pendingInvites.length > 0 ? (
        <Panel title={t("project_members.pending_title")} count={pendingInvites.length}>
          <Table<InviteRow>
            dense
            data-testid="pending-invites-table"
            rows={pendingInvites}
            rowKey={(row) => row.id}
            rowTestId={(row) => `pending-invite-row-${row.id}`}
            columns={[
              { id: "email", label: t("project_members.th_email"), render: (row) => row.email },
              {
                id: "role",
                label: t("project_members.th_assigned_role"),
                render: (row) => <Badge size="sm">{translateRole(t, row.projectRole)}</Badge>,
              },
              {
                id: "invited",
                label: t("project_members.th_invited_on"),
                muted: true,
                render: (row) => shortDate(row.createdAt),
              },
              {
                id: "expires",
                label: t("project_members.th_expires_on"),
                muted: true,
                render: (row) => shortDate(row.expiresAt),
              },
            ]}
          />
        </Panel>
      ) : null}

      <Dialog
        open={removing !== null}
        onClose={() => {
          setRemoving(null);
        }}
        title={removing ? t("project_members.remove_title", { name: removing.fullName }) : ""}
        description={t("project_members.remove_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setRemoving(null);
              }}
            >
              {t("project_members.btn_cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-remove-btn"
              onClick={() => {
                if (removing) {
                  void submit({ intent: "remove", userId: removing.userId }, { method: "post" });
                }
                setRemoving(null);
              }}
            >
              {t("project_members.btn_remove")}
            </Button>
          </>
        }
      />
    </div>
  );
}
