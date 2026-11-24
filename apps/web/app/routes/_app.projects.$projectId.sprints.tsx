import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import { APP_NAME, getTodayDateString, type SprintStatus, type SprintWithStatsDto } from "@pm/domain";

import { sprintsAction } from "../actions/sprintsAction";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button, buttonClass } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { MenuButton } from "../components/ui/Menu";
import { Panel } from "../components/ui/Page";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Table } from "../components/ui/Table";
import { sprintsLoader } from "../loaders/sprintsLoader";
import { formatShortDate } from "../utils/format";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Sprints — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return sprintsLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return sprintsAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
}

const STATUS_TONE: Record<SprintStatus, BadgeTone> = { ACTIVE: "progress", COMPLETED: "done", PLANNED: "neutral" };
const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export default function ProjectSprintsPage() {
  const { t, i18n } = useTranslation();
  const { project, sprints, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [isCreating, setIsCreating] = useState(false);
  const [editingSprint, setEditingSprint] = useState<SprintWithStatsDto | null>(null);
  const [prevActionData, setPrevActionData] = useState(actionData);
  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsCreating(false);
      setEditingSprint(null);
    }
  }

  const isSubmitting = navigation.state === "submitting";
  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const canManage = permissions.canManageSprint;
  const shortDate = (value: string) => formatShortDate(value, i18n.language);
  const range = (sprint: SprintWithStatsDto) => `${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}`;
  const statusLabel = (status: SprintStatus) =>
    status === "ACTIVE"
      ? t("project_sprints.status_active")
      : status === "COMPLETED"
        ? t("project_sprints.status_completed")
        : t("project_sprints.status_planned");

  const active = sprints.find((sprint) => sprint.status === "ACTIVE");
  const today = getTodayDateString(new Date());

  const archive = (sprint: SprintWithStatsDto) => {
    void submit({ intent: "archive", sprintId: sprint.id }, { method: "post" });
  };

  const createButton = canManage ? (
    <Button
      size="sm"
      variant="primary"
      icon="plus"
      onClick={() => {
        setIsCreating(true);
      }}
      data-testid="create-sprint-btn"
    >
      {t("project_sprints.btn_create")}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="sprints-page">
      {formError && !isCreating && !editingSprint ? (
        <Banner tone="danger" role="alert" data-testid="sprints-error-alert">
          {formError}
        </Banner>
      ) : null}

      {active ? (
        <Panel
          data-testid="active-sprint-panel"
          title={
            <>
              {active.name}
              <Badge tone="progress" dot size="sm">
                {t("project_sprints.status_active")}
              </Badge>
            </>
          }
          subtitle={`${range(active)} · ${t("project_sprints.days_left", { count: Math.max(0, daysBetween(today, active.endDate)) })}`}
          action={
            <Link to={`/projects/${project.id}?sprintId=${active.id}`} className={buttonClass("ghost", "sm")}>
              {t("project_sprints.view_tasks")}
              <Icon name="arrow-up-right" size={14} style={{ opacity: 0.7 }} />
            </Link>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <ProgressBar
              value={active.completedCount}
              total={active.taskCount || 1}
              tone="done"
              height={6}
              label={t("project_sprints.done_of", { done: active.completedCount, total: active.taskCount })}
            />
          </div>
        </Panel>
      ) : null}

      <Panel
        title={t("project_sprints.all_title")}
        subtitle={t("project_sprints.all_subtitle")}
        count={sprints.length}
        action={sprints.length ? createButton : null}
        data-testid="sprints-table-container"
      >
        {sprints.length === 0 ? (
          <EmptyState
            icon="target"
            title={t("project_sprints.empty_title")}
            description={t("project_sprints.empty_desc")}
            action={createButton}
            data-testid="empty-sprints"
          />
        ) : (
          <Table<SprintWithStatsDto>
            data-testid="sprints-table"
            rows={sprints}
            rowKey={(row) => row.id}
            rowTestId={(row) => `sprint-row-${row.id}`}
            columns={[
              {
                id: "name",
                label: t("project_sprints.th_name"),
                render: (row) => (
                  <span className="font-medium" data-testid="sprint-name">
                    {row.name}
                  </span>
                ),
              },
              {
                id: "status",
                label: t("project_sprints.th_status"),
                render: (row) => (
                  <Badge tone={STATUS_TONE[row.status]} dot size="sm" data-testid="sprint-status">
                    {statusLabel(row.status)}
                  </Badge>
                ),
              },
              {
                id: "duration",
                label: t("project_sprints.th_duration"),
                muted: true,
                render: (row) => <span data-testid="sprint-dates">{range(row)}</span>,
              },
              {
                id: "completion",
                label: t("project_sprints.th_completion"),
                width: 260,
                render: (row) => (
                  <div data-testid="sprint-completion">
                    {row.taskCount ? (
                      <ProgressBar
                        value={row.completedCount}
                        total={row.taskCount}
                        tone={row.completedCount === row.taskCount ? "done" : "accent"}
                        label={t("project_sprints.done_ratio", { done: row.completedCount, total: row.taskCount })}
                      />
                    ) : (
                      <span className="text-fg-muted">{t("project_sprints.no_tasks")}</span>
                    )}
                  </div>
                ),
              },
              {
                id: "actions",
                label: "",
                align: "right",
                width: 40,
                render: (row) =>
                  canManage ? (
                    <MenuButton
                      label={t("project_sprints.actions_label")}
                      data-testid={`sprint-actions-${row.id}`}
                      items={[
                        {
                          id: "edit",
                          label: t("project_sprints.btn_edit"),
                          icon: "pencil",
                          onSelect: () => {
                            setEditingSprint(row);
                          },
                          "data-testid": `edit-sprint-btn-${row.id}`,
                        },
                        {
                          id: "archive",
                          label: t("project_sprints.btn_archive"),
                          icon: "archive",
                          danger: true,
                          onSelect: () => {
                            archive(row);
                          },
                          "data-testid": `archive-sprint-btn-${row.id}`,
                        },
                      ]}
                    />
                  ) : null,
              },
            ]}
          />
        )}
      </Panel>

      <Dialog
        open={isCreating}
        onClose={() => {
          setIsCreating(false);
        }}
        title={t("project_sprints.create_title")}
        description={t("project_sprints.create_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setIsCreating(false);
              }}
            >
              {t("project_sprints.btn_cancel")}
            </Button>
            <Button
              type="submit"
              form="create-sprint-form"
              variant="primary"
              disabled={isSubmitting}
              data-testid="create-sprint-submit-btn"
            >
              {isSubmitting ? t("project_sprints.btn_creating") : t("project_sprints.btn_save_sprint")}
            </Button>
          </>
        }
      >
        <Form id="create-sprint-form" method="post" className="flex flex-col gap-3" data-testid="create-sprint-form">
          <input type="hidden" name="intent" value="create" />
          {formError ? (
            <Banner tone="danger" role="alert">
              {formError}
            </Banner>
          ) : null}
          <Input
            id="sprint-name"
            name="name"
            required
            label={t("project_sprints.label_name")}
            placeholder={t("project_sprints.placeholder_name")}
            error={actionData?.errors?.name?.join(", ")}
            data-testid="sprint-name-input"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="sprint-start"
              name="startDate"
              type="date"
              required
              label={t("project_sprints.label_start_date")}
              error={actionData?.errors?.startDate?.join(", ")}
              data-testid="sprint-start-date-input"
            />
            <Input
              id="sprint-end"
              name="endDate"
              type="date"
              required
              label={t("project_sprints.label_end_date")}
              error={actionData?.errors?.endDate?.join(", ")}
              data-testid="sprint-end-date-input"
            />
          </div>
        </Form>
      </Dialog>

      <Dialog
        open={editingSprint !== null}
        onClose={() => {
          setEditingSprint(null);
        }}
        title={editingSprint ? t("project_sprints.edit_title", { name: editingSprint.name }) : ""}
        footer={
          <>
            <Button
              onClick={() => {
                setEditingSprint(null);
              }}
            >
              {t("project_sprints.btn_cancel")}
            </Button>
            <Button
              type="submit"
              form="edit-sprint-form"
              variant="primary"
              disabled={isSubmitting}
              data-testid="edit-sprint-submit-btn"
            >
              {isSubmitting ? t("project_sprints.btn_saving") : t("project_sprints.btn_save_changes")}
            </Button>
          </>
        }
      >
        {editingSprint ? (
          <Form id="edit-sprint-form" method="post" className="flex flex-col gap-3" data-testid="edit-sprint-form">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="sprintId" value={editingSprint.id} />
            {formError ? (
              <Banner tone="danger" role="alert">
                {formError}
              </Banner>
            ) : null}
            <Input
              id="edit-sprint-name"
              name="name"
              required
              label={t("project_sprints.label_name")}
              defaultValue={editingSprint.name}
              data-testid="edit-sprint-name-input"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="edit-sprint-start"
                name="startDate"
                type="date"
                required
                label={t("project_sprints.label_start_date")}
                defaultValue={editingSprint.startDate}
                data-testid="edit-sprint-start-date-input"
              />
              <Input
                id="edit-sprint-end"
                name="endDate"
                type="date"
                required
                label={t("project_sprints.label_end_date")}
                defaultValue={editingSprint.endDate}
                data-testid="edit-sprint-end-date-input"
              />
            </div>
          </Form>
        ) : null}
      </Dialog>
    </div>
  );
}
