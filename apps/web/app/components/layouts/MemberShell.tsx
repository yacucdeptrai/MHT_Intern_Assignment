import type { ReactNode } from "react";
import { Form, NavLink } from "react-router";

import type { SessionUser } from "@pm/domain";
import { APP_NAME } from "@pm/domain";

export interface MemberShellProps {
  user: SessionUser;
  children: ReactNode;
}

export function MemberShell({ user, children }: MemberShellProps) {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-slate-800 text-white font-semibold" : "text-slate-300 hover:bg-slate-700 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" data-testid="member-shell">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-md">
        <div className="p-4 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <span className="block text-lg font-bold tracking-tight text-white">{APP_NAME}</span>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-slate-800 text-slate-300 rounded">
              Workspace
            </span>
          </div>

          <nav className="space-y-1">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/my-tasks" className={navLinkClass}>
              My Tasks
            </NavLink>
            <NavLink to="/projects" className={navLinkClass}>
              My Projects
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
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white uppercase shrink-0">
              {user.fullName.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <NavLink to="/profile" className="block text-sm font-medium text-white hover:underline truncate">
                {user.fullName}
              </NavLink>
              <p className="text-xs text-slate-400 truncate">
                {user.systemRole} · {user.email}
              </p>
            </div>
          </div>

          <Form method="post" action="/logout">
            <button
              type="submit"
              className="w-full text-center px-3 py-1.5 rounded text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
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
