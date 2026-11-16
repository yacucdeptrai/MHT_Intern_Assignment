import { UserFiltersSchema, type Page, type UserAdminRow, type UserFilters } from "@pm/domain";

import { userService } from "../services/user/user.service";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface AdminUsersLoaderData {
  users: Page<UserAdminRow>;
  filters: UserFilters;
}

export async function adminUsersLoader(ctx: RequestContext, request: Request): Promise<AdminUsersLoaderData> {
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN"]);

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsedFilters = UserFiltersSchema.parse(rawParams);

  const usersPage = await userService.listUsers(ctx, parsedFilters);

  return {
    users: usersPage,
    filters: parsedFilters,
  };
}
