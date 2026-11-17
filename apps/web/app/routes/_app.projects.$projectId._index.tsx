import { Link, useRouteLoaderData } from "react-router";

import type { ProjectHeaderLoaderData } from "../loaders/projectHeaderLoader";

export default function ProjectIndexPage() {
  const data = useRouteLoaderData<ProjectHeaderLoaderData>("routes/_app.projects.$projectId");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm" data-testid="project-overview">
      <div className="text-center py-10">
        <h2 className="text-lg font-semibold text-gray-900">Task Management</h2>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Tasks and sprints for {data?.project.name ?? "this project"} will appear here.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            to="/projects"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            ← Back to Projects
          </Link>
          {data?.permissions.canManageMembers ? (
            <Link
              to={`/projects/${data.project.id}/members`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              data-testid="view-members-link"
            >
              Manage Members
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
