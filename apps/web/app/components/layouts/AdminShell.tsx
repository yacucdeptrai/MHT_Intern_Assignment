import type { ReactNode } from "react";
import { Form, NavLink } from "react-router";

import type { SessionUser } from "@pm/domain";
import { APP_NAME } from "@pm/domain";

export interface AdminShellProps {
  user: SessionUser;
  children: ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const isAdmin = user.systemRole === "ADMIN";

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-blue-800 text-white font-semibold" : "text-blue-100 hover:bg-blue-700 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" data-testid="admin-shell">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-blue-900 text-white flex flex-col justify-between shrink-0 shadow-md">
        <div className="p-4 space-y-6">
          <div className="border-b border-blue-800 pb-4">
            <span className="block text-lg font-bold tracking-tight text-white">{APP_NAME}</span>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-blue-800 text-blue-200 rounded">
              Admin & PM Portal
            </span>
          </div>

          <nav className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-blue-300 mb-2">Management</p>
            <NavLink to="/admin" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/projects" className={navLinkClass}>
              Projects
            </NavLink>

            {isAdmin ? (
              <>
                <NavLink to="/admin/users" className={navLinkClass}>
                  User Management
                </NavLink>
                <NavLink to="/admin/statuses" className={navLinkClass}>
                  Statuses
                </NavLink>
                <NavLink to="/admin/audit-log" className={navLinkClass}>
                  Audit Log
                </NavLink>
              </>
            ) : null}

            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-blue-300 mt-6 mb-2">Personal</p>
            <NavLink to="/my-tasks" className={navLinkClass}>
              My Tasks
            </NavLink>
            <NavLink to="/calendar" className={navLinkClass}>
              Calendar
            </NavLink>
            <NavLink to="/notifications" className={navLinkClass}>
              Notifications
            </NavLink>
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-blue-800 bg-blue-950/40 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-700 flex items-center justify-center text-sm font-bold text-white uppercase shrink-0">
              {user.fullName.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <NavLink to="/profile" className="block text-sm font-medium text-white hover:underline truncate">
                {user.fullName}
              </NavLink>
              <p className="text-xs text-blue-300 truncate">
                {user.systemRole} · {user.email}
              </p>
            </div>
          </div>

          <Form method="post" action="/logout">
            <button
              type="submit"
              className="w-full text-center px-3 py-1.5 rounded text-xs font-medium bg-blue-800 text-blue-100 hover:bg-blue-700 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </Form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
