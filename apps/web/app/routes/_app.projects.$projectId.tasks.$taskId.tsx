import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import { APP_NAME, type TaskDetailLoaderData } from "@pm/domain";

import { taskDetailAction } from "../actions/taskDetailAction";
import { ProjectTasksView } from "../components/tasks/ProjectTasksView";
import { TaskDrawer, type TaskActionData } from "../components/tasks/TaskDrawer";
import { projectTasksLoader, type ProjectTasksLoaderData } from "../loaders/projectTasksLoader";
import { taskDetailLoader } from "../loaders/taskDetailLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta({ data }: { data?: TaskDetailLoaderData }) {
  if (!data?.task) {
    return [{ title: `Task — ${APP_NAME}` }];
  }
  return [{ title: `${data.task.projectCode}-${String(data.task.number)}: ${data.task.title} — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  const taskId = params.taskId ?? "";
  // The drawer sits over the project's task list, so the route also returns that list
  // (same loader as the Tasks tab, same filters from the URL).
  const detail = await taskDetailLoader(ctx, projectId, taskId, request);
  // Archived projects reject the list query; the drawer then opens on its own.
  const list = await projectTasksLoader(ctx, projectId, request).catch(() => null);
  return { ...detail, list };
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  const taskId = params.taskId ?? "";
  return taskDetailAction(ctx, projectId, taskId, request);
}

/** ≥1200px the drawer docks beside the list; below that it overlays it. */
function useIsDocked(): boolean {
  const [isDocked, setIsDocked] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1200px)");
    const update = () => {
      setIsDocked(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  return isDocked;
}

export default function TaskDetailPage() {
  const { list, ...detail } = useLoaderData<typeof loader>() as TaskDetailLoaderData & {
    list: ProjectTasksLoaderData | null;
  };
  const actionData = useActionData<TaskActionData>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appData = useRouteLoaderData<{ user: { fullName: string } }>("routes/_app");
  const isDocked = useIsDocked();

  const { task } = detail;
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const ids = list ? list.tasks.items.map((item) => item.id) : [];
  const index = ids.indexOf(task.id);
  const hrefAt = (position: number) => {
    const id = ids[position];
    return id ? `/projects/${task.projectId}/tasks/${id}${search}` : null;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The project layout reserves the drawer width at ≥1200px; below that the drawer overlays. */}
      {list ? <ProjectTasksView data={list} selectedTaskId={task.id} /> : null}
      <TaskDrawer
        key={task.id}
        data={detail}
        actionData={actionData}
        isSubmitting={navigation.state === "submitting"}
        currentUserName={appData?.user.fullName ?? ""}
        width={isDocked ? "var(--drawer-width)" : "min(var(--drawer-width), 92vw)"}
        prevHref={index > 0 ? hrefAt(index - 1) : null}
        nextHref={index >= 0 ? hrefAt(index + 1) : null}
        onClose={() => {
          void navigate(`/projects/${task.projectId}${search}`);
        }}
      />
    </div>
  );
}
