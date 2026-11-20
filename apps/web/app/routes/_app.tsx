import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { AppShell } from "../components/layouts/AppShell";
import { notificationService } from "../services/notification.service";
import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";
import { useRealtimeNotifications } from "../utils/useRealtimeNotifications";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);
  // Sidebar data: the projects this user can open, and the unread notification badge.
  const [projects, unreadCount] = await Promise.all([
    projectService.listProjects(ctx),
    notificationService.countUnread(ctx),
  ]);
  return {
    user,
    sidebarProjects: projects.map((project) => ({ id: project.id, name: project.name, code: project.code })),
    unreadCount,
  };
}

export default function AppLayout() {
  const { user, sidebarProjects, unreadCount } = useLoaderData<typeof loader>();
  useRealtimeNotifications(Boolean(user));

  return (
    <AppShell user={user} projects={sidebarProjects} unreadCount={unreadCount}>
      <Outlet />
    </AppShell>
  );
}
