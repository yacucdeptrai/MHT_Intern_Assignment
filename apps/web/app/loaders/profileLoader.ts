import { profileService, type ProfileDetailsResult } from "../services/user/profile.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function profileLoader(ctx: RequestContext, request: Request): Promise<ProfileDetailsResult> {
  const user = await requireUser(ctx, request);
  return profileService.getProfile(ctx, user.id);
}
