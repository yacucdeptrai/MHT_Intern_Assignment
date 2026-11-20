import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import { APP_NAME, PROJECT_STATUSES } from "@pm/domain";

import { projectSettingsAction } from "../actions/projectSettingsAction";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input, Textarea } from "../components/ui/Input";
import { Section } from "../components/ui/Section";
import { Select } from "../components/ui/Select";
import { Toast } from "../components/ui/Toast";
import { translateProjectStatus } from "../i18n/labels";
import { projectSettingsLoader } from "../loaders/projectSettingsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Settings — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectSettingsLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectSettingsAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

function fieldError(message: string | undefined, testId: string) {
  return message ? <span data-testid={testId}>{message}</span> : undefined;
}

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { project, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const errorOf = (field: string) => actionData?.errors?.[field]?.[0];
  const values = actionData?.values ?? {};
  const isReadOnly = project.isArchived || !permissions.canManageProject;

  return (
    <div className="flex max-w-[880px] flex-col gap-4" data-testid="project-settings-page">
      {project.isArchived ? <Banner tone="warning">{t("project_settings.archived_banner")}</Banner> : null}
      {formError ? (
        <Banner tone="danger" role="alert" data-testid="form-error">
          {formError}
        </Banner>
      ) : null}

      <Form method="post" data-testid="update-project-form">
        <input type="hidden" name="intent" value="update" />
        <Section title={t("project_settings.section_general")} description={t("project_settings.section_general_desc")}>
          <div className="grid grid-cols-2 gap-3.5">
            <Input
              id="code"
              name="code"
              disabled
              label={t("project_settings.code_label")}
              defaultValue={project.code}
              hint={t("project_settings.code_hint")}
              className="font-mono"
              data-testid="input-code"
            />
            <Select
              id="status"
              name="status"
              disabled={isReadOnly}
              label={t("project_settings.status_label")}
              defaultValue={values.status ?? project.status}
              options={PROJECT_STATUSES.map((status) => ({ value: status, label: translateProjectStatus(t, status) }))}
              error={fieldError(errorOf("status"), "error-status")}
              data-testid="select-status"
            />
          </div>
          <Input
            id="name"
            name="name"
            required
            disabled={isReadOnly}
            label={t("project_settings.name_label")}
            placeholder={t("project_settings.name_placeholder")}
            defaultValue={values.name ?? project.name}
            error={fieldError(errorOf("name"), "error-name")}
            data-testid="input-name"
          />
          <Textarea
            id="description"
            name="description"
            rows={3}
            disabled={isReadOnly}
            label={t("project_settings.desc_label")}
            placeholder={t("project_settings.desc_placeholder")}
            defaultValue={values.description ?? project.description ?? ""}
            error={fieldError(errorOf("description"), "error-description")}
            data-testid="input-description"
          />
        </Section>

        <Section
          title={t("project_settings.section_timeline")}
          description={t("project_settings.section_timeline_desc")}
        >
          <div className="grid grid-cols-2 gap-3.5">
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              disabled={isReadOnly}
              label={t("project_settings.start_date_label")}
              defaultValue={values.startDate ?? project.startDate}
              error={fieldError(errorOf("startDate"), "error-start-date")}
              data-testid="input-start-date"
            />
            <Input
              id="endDate"
              name="endDate"
              type="date"
              required
              disabled={isReadOnly}
              label={t("project_settings.end_date_label")}
              defaultValue={values.endDate ?? project.endDate}
              error={fieldError(errorOf("endDate"), "error-end-date")}
              data-testid="input-end-date"
            />
            <Input
              id="budget"
              name="budget"
              type="number"
              min="0"
              disabled={isReadOnly}
              label={t("project_settings.budget_label")}
              placeholder={t("project_settings.budget_placeholder")}
              defaultValue={values.budget ?? (project.budget != null ? String(project.budget) : "")}
              error={fieldError(errorOf("budget"), "error-budget")}
              data-testid="input-budget"
            />
          </div>
        </Section>

        <Section
          title={t("project_settings.section_integrations")}
          description={t("project_settings.section_integrations_desc")}
        >
          <Input
            id="slackChannelId"
            name="slackChannelId"
            disabled={isReadOnly}
            label={t("project_settings.slack_label")}
            placeholder={t("project_settings.slack_placeholder")}
            defaultValue={values.slackChannelId ?? project.slackChannelId ?? ""}
            error={fieldError(errorOf("slackChannelId"), "error-slack-channel")}
            className="font-mono"
            data-testid="input-slack-channel"
          />
          {!isReadOnly ? (
            <div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                data-testid="save-settings-button"
              >
                {isSubmitting ? t("project_settings.btn_saving") : t("project_settings.btn_save")}
              </Button>
            </div>
          ) : null}
        </Section>
      </Form>

      {permissions.canManageProject && !project.isArchived ? (
        <Section
          title={t("project_settings.danger_title")}
          description={t("project_settings.danger_desc")}
          data-testid="danger-zone"
        >
          <div className="flex items-center gap-4 rounded-lg border border-line-default px-3.5 py-3">
            <span className="flex-1 text-[13px] leading-[1.45] text-fg-secondary">
              {t("project_settings.danger_note")}
            </span>
            <Button
              variant="danger"
              size="sm"
              icon="archive"
              onClick={() => {
                setIsArchiveOpen(true);
              }}
              data-testid="archive-project-button"
            >
              {t("project_settings.btn_archive")}
            </Button>
          </div>
        </Section>
      ) : null}

      <Dialog
        open={isArchiveOpen}
        onClose={() => {
          setIsArchiveOpen(false);
        }}
        title={t("project_settings.archive_title", { name: project.name })}
        description={t("project_settings.archive_desc")}
        footer={
          <>
            <Button
              onClick={() => {
                setIsArchiveOpen(false);
              }}
            >
              {t("project_settings.btn_cancel")}
            </Button>
            <Button
              variant="danger"
              icon="archive"
              disabled={isSubmitting}
              data-testid="confirm-archive-btn"
              onClick={() => {
                void submit({ intent: "archive" }, { method: "post" });
                setIsArchiveOpen(false);
              }}
            >
              {isSubmitting ? t("project_settings.btn_archiving") : t("project_settings.btn_archive")}
            </Button>
          </>
        }
      />

      <Toast
        text={actionData?.success ? t("project_settings.success_banner") : null}
        id={actionData}
        data-testid="success-banner"
      />
    </div>
  );
}
