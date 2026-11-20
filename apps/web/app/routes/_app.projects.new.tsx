import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectCreateAction } from "../actions/projectCreateAction";
import { Banner } from "../components/ui/Banner";
import { Button, buttonClass } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { Page } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Section } from "../components/ui/Section";
import { projectCreateLoader } from "../loaders/projectCreateLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `New project — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectCreateLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectCreateAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

/** Field error with the testid the journeys assert on. */
function fieldError(message: string | undefined, testId: string) {
  return message ? <span data-testid={testId}>{message}</span> : undefined;
}

export default function ProjectCreatePage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const isSubmitting = navigation.state === "submitting";

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const values = actionData?.values ?? {};
  const errorOf = (field: string) => actionData?.errors?.[field]?.[0];

  return (
    <Page
      maxWidth={880}
      header={<PageHeader title={t("project_new.title")} description={t("project_new.description")} />}
    >
      {formError ? (
        <Banner tone="danger" role="alert" data-testid="form-error">
          {formError}
        </Banner>
      ) : null}

      <Form method="post" data-testid="create-project-form">
        <Section title={t("project_new.section_general")} description={t("project_new.section_general_desc")}>
          <div className="grid grid-cols-2 gap-3.5">
            <Input
              id="code"
              name="code"
              required
              label={t("project_new.code_label")}
              placeholder={t("project_new.code_placeholder")}
              hint={t("project_new.code_hint")}
              defaultValue={values.code ?? ""}
              error={fieldError(errorOf("code"), "error-code")}
              className="font-mono uppercase"
              data-testid="input-code"
            />
            <Input
              id="name"
              name="name"
              required
              label={t("project_new.name_label")}
              placeholder={t("project_new.name_placeholder")}
              defaultValue={values.name ?? ""}
              error={fieldError(errorOf("name"), "error-name")}
              data-testid="input-name"
            />
          </div>
          <Textarea
            id="description"
            name="description"
            rows={3}
            label={t("project_new.description_label")}
            placeholder={t("project_new.description_placeholder")}
            defaultValue={values.description ?? ""}
            error={fieldError(errorOf("description"), "error-description")}
            data-testid="input-description"
          />
        </Section>

        <Section title={t("project_new.section_timeline")} description={t("project_new.section_timeline_desc")}>
          <div className="grid grid-cols-2 gap-3.5">
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              label={t("project_new.start_date_label")}
              defaultValue={values.startDate ?? ""}
              error={fieldError(errorOf("startDate"), "error-start-date")}
              data-testid="input-start-date"
            />
            <Input
              id="endDate"
              name="endDate"
              type="date"
              required
              label={t("project_new.end_date_label")}
              defaultValue={values.endDate ?? ""}
              error={fieldError(errorOf("endDate"), "error-end-date")}
              data-testid="input-end-date"
            />
            <Input
              id="budget"
              name="budget"
              type="number"
              min="0"
              label={t("project_new.budget_label")}
              placeholder={t("project_new.budget_placeholder")}
              defaultValue={values.budget ?? ""}
              error={fieldError(errorOf("budget"), "error-budget")}
              data-testid="input-budget"
            />
          </div>
        </Section>

        <Section title={t("project_new.section_integrations")} description={t("project_new.section_integrations_desc")}>
          <Input
            id="slackChannelId"
            name="slackChannelId"
            label={t("project_new.slack_channel_label")}
            placeholder={t("project_new.slack_channel_placeholder")}
            defaultValue={values.slackChannelId ?? ""}
            error={fieldError(errorOf("slackChannelId"), "error-slack")}
            className="font-mono"
            data-testid="input-slack"
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              data-testid="submit-project-button"
            >
              {isSubmitting ? t("project_new.submitting") : t("project_new.submit")}
            </Button>
            <Link to="/projects" className={buttonClass("ghost", "sm")}>
              {t("project_new.cancel")}
            </Link>
          </div>
        </Section>
      </Form>
    </Page>
  );
}
