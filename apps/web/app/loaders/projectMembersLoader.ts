import {
  ForbiddenError,
  getProjectPermissions,
  NotFoundError,
  toActor,
  type InviteRow,
  type MemberRow,
  type ProjectPermissions,
} from "@pm/domain";

import { projectMemberService } from "../services/project/projectMember.service";
import { loadProjectAccess, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface UserSearchItem {
  id: string;
  fullName: string;
  email: string;
  avatarKey: string | null;
}

export interface ProjectMembersLoaderData {
  members: MemberRow[];
  pendingInvites: InviteRow[];
  permissions: ProjectPermissions;
  isArchived: boolean;
  searchResults?: UserSearchItem[];
}

export async function projectMembersLoader(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<ProjectMembersLoaderData> {
  const user = await requireUser(ctx, request);

  if (!projectId) {
    throw new Response("Not found", { status: 404 });
  }

  try {
    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(user, access);
    const permissions = getProjectPermissions(actor);

    const url = new URL(request.url);
    if (url.searchParams.has("q")) {
      const q = url.searchParams.get("q") ?? "";
      const searchResults = await projectMemberService.searchUsers(ctx, projectId, { q });
      return {
        members: [],
        pendingInvites: [],
        permissions,
        isArchived: access.isArchived,
        searchResults,
      };
    }

    const data = await projectMemberService.getProjectMembers(ctx, projectId);

    return {
      members: data.members,
      pendingInvites: data.pendingInvites,
      permissions,
      isArchived: access.isArchived,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}
