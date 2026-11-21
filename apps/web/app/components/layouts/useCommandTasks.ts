import { useEffect, useRef } from "react";
import { useFetcher, useNavigate } from "react-router";

import type { TaskListItem } from "@pm/domain";

interface TaskListData {
  tasks?: { items: TaskListItem[] };
}

interface CreateTaskResponse {
  success?: boolean;
  message?: string;
  task?: { id: string; projectId: string };
}

/**
 * Data behind the command bar's Tasks group and quick-add. Tasks come from the loaders the
 * app already has (the current project's Tasks tab, or My tasks elsewhere), fetched when the
 * bar opens. Quick-add posts the existing createTask intent and opens the new task.
 */
export function useCommandTasks(isOpen: boolean, projectId: string | null) {
  const navigate = useNavigate();
  const list = useFetcher<TaskListData>();
  const create = useFetcher<CreateTaskResponse>();
  const source = projectId ? `/projects/${projectId}?index` : "/my-tasks";
  const loadedFrom = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && list.state === "idle" && loadedFrom.current !== source) {
      loadedFrom.current = source;
      void list.load(source);
    }
    if (!isOpen) {
      // Reload on the next open so the list reflects changes made since.
      loadedFrom.current = null;
    }
  }, [isOpen, source, list]);

  const created = create.data?.success ? create.data.task : undefined;
  const isCreateIdle = create.state === "idle";
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the post-action revalidation to settle; navigating during it can leave the old route rendered.
    if (created && isCreateIdle && openedId.current !== created.id) {
      openedId.current = created.id;
      void navigate(`/projects/${created.projectId}/tasks/${created.id}`);
    }
  }, [created, isCreateIdle, navigate]);

  const createTask = (targetProjectId: string, title: string) => {
    void create.submit(
      { intent: "createTask", title },
      { method: "post", action: `/projects/${targetProjectId}?index` },
    );
  };

  return {
    tasks: list.data?.tasks?.items ?? [],
    createTask,
    createError: create.data && !create.data.success ? (create.data.message ?? null) : null,
    createResult: create.data,
  };
}
