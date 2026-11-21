import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectTasksAction } from "../actions/projectTasksAction";
import { ProjectTasksView, type ActionData } from "../components/tasks/ProjectTasksView";
import { projectTasksLoader, type ProjectTasksLoaderData } from "../loaders/projectTasksLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Tasks — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksLoader(ctx, projectId, request);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksAction(ctx, projectId, request);
}

export default function ProjectIndexPage() {
  const data = useLoaderData<ProjectTasksLoaderData>();
  const actionData = useActionData<ActionData>();
  return <ProjectTasksView data={data} createActionData={actionData} />;
}
