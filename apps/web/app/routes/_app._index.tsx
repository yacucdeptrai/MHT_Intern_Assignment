import type { LoaderFunctionArgs } from "react-router";
import { Link, redirect, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);
  if (user.systemRole === "ADMIN" || user.systemRole === "PM") {
    throw redirect("/admin");
  }
  return { user };
}

export default function MemberDashboardPage() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Project & Task Management</h1>
        <p className="mt-1 text-sm text-gray-500">Welcome back, {user.fullName}. Here is your workspace summary.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
          <p className="text-sm text-gray-600">View tasks assigned to you across all your projects.</p>
          <div className="pt-2">
            <Link
              to="/my-tasks"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              Go to My Tasks →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">My Projects</h2>
          <p className="text-sm text-gray-600">Access your active project boards and team discussions.</p>
          <div className="pt-2">
            <Link
              to="/projects"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              Browse Projects →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Calendar</h2>
          <p className="text-sm text-gray-600">Check upcoming milestone deadlines and schedules.</p>
          <div className="pt-2">
            <Link
              to="/calendar"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              Open Calendar →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
