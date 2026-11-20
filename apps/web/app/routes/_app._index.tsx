import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { DashboardView } from "../components/dashboard/DashboardView";
import { dashboardLoader } from "../loaders/dashboardLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return dashboardLoader(ctx, request);
}

export default function MemberDashboardPage() {
  const { user, inProgress, inReview, todayPriorities, overdue, unreadCount } = useLoaderData<typeof loader>();

  return (
    <DashboardView
      testId="personal-dashboard"
      isPortal={false}
      fullName={user.fullName}
      unreadCount={unreadCount}
      inProgress={inProgress}
      inReview={inReview}
      todayPriorities={todayPriorities}
      overdue={overdue}
    />
  );
}
