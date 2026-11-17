import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";

import { APP_NAME, PROJECT_ROLES, type ProjectRole } from "@pm/domain";

import { projectMembersAction } from "../actions/projectMembersAction";
import { projectMembersLoader, type UserSearchItem } from "../loaders/projectMembersLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Project Members — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectMembersLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectMembersAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  inviteUrl?: string;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function ProjectMembersPage() {
  const { members, pendingInvites, permissions, isArchived } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const searchFetcher = useFetcher<{ searchResults?: UserSearchItem[] }>();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [addRole, setAddRole] = useState<ProjectRole>("MEMBER");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("MEMBER");

  const [copied, setCopied] = useState(false);

  const isSubmitting = navigation.state === "submitting";

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const userError = actionData?.errors?.userId?.[0];
  const emailError = actionData?.errors?.email?.[0];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    void searchFetcher.load(`?q=${encodeURIComponent(q)}`);
  };

  const handleCopyInviteUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const searchResults = searchFetcher.data?.searchResults ?? [];

  return (
    <div className="space-y-8" data-testid="project-members-page">
      {/* Read-only / archived banner */}
      {isArchived ? (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 border border-amber-200">
          This project is archived and read-only. Members cannot be modified.
        </div>
      ) : null}

      {/* Success banner */}
      {actionData?.success && !actionData.inviteUrl ? (
        <div
          className="rounded-lg bg-green-50 p-4 text-sm text-green-700 border border-green-200"
          data-testid="success-banner"
        >
          Operation completed successfully.
        </div>
      ) : null}

      {/* Invite URL display */}
      {actionData?.inviteUrl ? (
        <div
          className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900 border border-blue-200 space-y-2"
          data-testid="invite-url-box"
        >
          <div className="font-semibold text-blue-950">Invite Link Generated!</div>
          <p className="text-blue-800 text-xs">
            Share this link with the recipient so they can accept their invitation and join the project:
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={actionData.inviteUrl}
              className="flex-1 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs text-gray-900 font-mono shadow-sm"
              data-testid="invite-url-link"
            />
            <button
              type="button"
              onClick={() => {
                handleCopyInviteUrl(actionData.inviteUrl ?? "");
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
              data-testid="copy-invite-url-btn"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Error banner */}
      {formError ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200" data-testid="action-error">
          {formError}
        </div>
      ) : null}

      {/* Member Management Forms (Only if canManageMembers and not archived) */}
      {permissions.canManageMembers && !isArchived ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Add Existing Member Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Add Existing User</h2>
            <Form method="post" className="space-y-4" data-testid="add-member-form">
              <input type="hidden" name="intent" value="add" />

              <div>
                <label htmlFor="searchQuery" className="block text-xs font-medium text-gray-700 mb-1">
                  Search Active Users
                </label>
                <input
                  id="searchQuery"
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Type name or email to search..."
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="search-user-input"
                />
              </div>

              {searchFetcher.state === "loading" ? (
                <p className="text-xs text-gray-500 italic">Searching...</p>
              ) : searchResults.length > 0 ? (
                <div>
                  <label htmlFor="userId" className="block text-xs font-medium text-gray-700 mb-1">
                    Select User
                  </label>
                  <select
                    id="userId"
                    name="userId"
                    value={selectedUserId}
                    onChange={(e) => {
                      setSelectedUserId(e.target.value);
                    }}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="search-user-select"
                  >
                    <option value="">-- Choose user --</option>
                    {searchResults.map((u) => (
                      <option key={u.id} value={u.id} data-testid={`user-option-${u.id}`}>
                        {u.fullName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : searchQuery.trim().length > 0 ? (
                <p className="text-xs text-gray-500 italic">No non-member active users found.</p>
              ) : null}

              {userError ? <p className="text-xs text-red-600">{userError}</p> : null}

              <div>
                <label htmlFor="addRole" className="block text-xs font-medium text-gray-700 mb-1">
                  Project Role
                </label>
                <select
                  id="addRole"
                  name="projectRole"
                  value={addRole}
                  onChange={(e) => {
                    setAddRole(e.target.value as ProjectRole);
                  }}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="add-member-role-select"
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !selectedUserId}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                data-testid="add-member-submit-btn"
              >
                {isSubmitting ? "Adding..." : "Add to Project"}
              </button>
            </Form>
          </div>

          {/* Invite New User by Email Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Invite by Email</h2>
            <Form method="post" className="space-y-4" data-testid="invite-member-form">
              <input type="hidden" name="intent" value="invite" />

              <div>
                <label htmlFor="inviteEmail" className="block text-xs font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  name="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                  }}
                  placeholder="new-teammate@example.com"
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="invite-email-input"
                />
                {emailError ? <p className="text-xs text-red-600 mt-1">{emailError}</p> : null}
              </div>

              <div>
                <label htmlFor="inviteRole" className="block text-xs font-medium text-gray-700 mb-1">
                  Assigned Project Role
                </label>
                <select
                  id="inviteRole"
                  name="projectRole"
                  value={inviteRole}
                  onChange={(e) => {
                    setInviteRole(e.target.value as ProjectRole);
                  }}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="invite-role-select"
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !inviteEmail.trim()}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                data-testid="invite-submit-btn"
              >
                {isSubmitting ? "Inviting..." : "Send Invitation"}
              </button>
            </Form>
          </div>
        </div>
      ) : null}

      {/* Members List Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Project Members ({members.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200" data-testid="members-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                {permissions.canManageMembers && !isArchived ? (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map((member) => (
                <tr key={member.userId} data-testid={`member-row-${member.userId}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                        {member.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900" data-testid={`member-name-${member.userId}`}>
                          {member.fullName}
                        </div>
                        <div className="text-xs text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {permissions.canManageMembers && !isArchived ? (
                      <Form method="post" className="inline-block">
                        <input type="hidden" name="intent" value="changeRole" />
                        <input type="hidden" name="userId" value={member.userId} />
                        <select
                          name="projectRole"
                          defaultValue={member.projectRole}
                          onChange={(e) => {
                            e.target.form?.requestSubmit();
                          }}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          data-testid={`member-role-select-${member.userId}`}
                        >
                          {PROJECT_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </Form>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
                        data-testid={`member-role-${member.userId}`}
                      >
                        {member.projectRole}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  {permissions.canManageMembers && !isArchived ? (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (!confirm(`Are you sure you want to remove ${member.fullName} from this project?`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="userId" value={member.userId} />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900 text-xs font-medium"
                          data-testid={`remove-member-btn-${member.userId}`}
                        >
                          Remove
                        </button>
                      </Form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Table */}
      {pendingInvites.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Pending Invitations ({pendingInvites.length})</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200" data-testid="pending-invites-table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invited On
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires On
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingInvites.map((invite) => (
                  <tr key={invite.id} data-testid={`pending-invite-row-${invite.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invite.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                        {invite.projectRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
