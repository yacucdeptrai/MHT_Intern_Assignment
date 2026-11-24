import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { DashboardView } from "../components/dashboard/DashboardView";
import { adminDashboardLoader } from "../loaders/adminDashboardLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminDashboardLoader(ctx, request);
}

export default function AdminDashboardPage() {
  const { user, projectsAtRisk, inProgress, inReview, todayPriorities, overdue, unreadCount } =
    useLoaderData<typeof loader>();

  return (
    <DashboardView
      testId="admin-dashboard"
      isPortal
      isOrgWide={user.systemRole === "ADMIN"}
      fullName={user.fullName}
      unreadCount={unreadCount}
      inProgress={inProgress}
      inReview={inReview}
      todayPriorities={todayPriorities}
      overdue={overdue}
      projectsAtRisk={projectsAtRisk}
    />
  );
}
