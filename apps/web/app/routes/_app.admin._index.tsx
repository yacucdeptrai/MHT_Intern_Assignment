import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { requireSystemRole, requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Admin Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN", "PM"]);
  return { user };
}

export default function AdminDashboardPage() {
  const { user } = useLoaderData<typeof loader>();
  const isAdmin = user.systemRole === "ADMIN";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {user.fullName}. You are signed in as an organization {user.systemRole}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-600">
            {isAdmin ? "Oversee, configure, and monitor all organization projects." : "Manage projects you coordinate."}
          </p>
          <div className="pt-2">
            <Link
              to="/projects"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              View Projects →
            </Link>
          </div>
        </div>

        {isAdmin ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">User Management</h2>
              <p className="text-sm text-gray-600">
                Invite new team members, manage account status, and assign system permissions.
              </p>
              <div className="pt-2">
                <Link
                  to="/admin/users"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Manage Users →
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Task Statuses</h2>
              <p className="text-sm text-gray-600">Configure system-wide workflow statuses and category defaults.</p>
              <div className="pt-2">
                <Link
                  to="/admin/statuses"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Configure Statuses →
                </Link>
              </div>
            </div>
          </>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
          <p className="text-sm text-gray-600">Track tasks assigned to you or waiting for your review.</p>
          <div className="pt-2">
            <Link
              to="/my-tasks"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Go to My Tasks →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
