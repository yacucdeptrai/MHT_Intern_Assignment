import { MemberAddSchema, MemberIdSchema, MemberInviteSchema, MemberRoleSchema, NotFoundError } from "@pm/domain";

import { projectMemberService } from "../services/project/projectMember.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectMembersAction(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    await requireUser(ctx, request);

    if (!projectId) {
      throw new NotFoundError("Project not found");
    }

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);

    const intent = rawData.intent;
    if (intent !== "add" && intent !== "remove" && intent !== "invite" && intent !== "changeRole") {
      return Response.json({ success: false, errors: { intent: ["Invalid or missing intent"] } }, { status: 400 });
    }

    if (intent === "add") {
      const parsed = MemberAddSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json({ success: false, errors: fieldErrors }, { status: 400 });
      }

      const result = await projectMemberService.addMember(ctx, projectId, parsed.data);
      return Response.json(result);
    }

    if (intent === "remove") {
      const parsed = MemberIdSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json({ success: false, errors: fieldErrors }, { status: 400 });
      }

      const result = await projectMemberService.removeMember(ctx, projectId, parsed.data);
      return Response.json(result);
    }

    if (intent === "invite") {
      const parsed = MemberInviteSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json({ success: false, errors: fieldErrors }, { status: 400 });
      }

      const result = await projectMemberService.inviteMember(ctx, projectId, parsed.data);
      return Response.json({ success: true, inviteUrl: result.inviteUrl });
    }

    // intent === "changeRole"
    const parsed = MemberRoleSchema.safeParse(rawData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      return Response.json({ success: false, errors: fieldErrors }, { status: 400 });
    }

    const result = await projectMemberService.changeRole(ctx, projectId, parsed.data);
    return Response.json(result);
  } catch (error) {
    const response = handleActionError(error, ctx);
    if (response.status === 400) {
      const json = await response.json<Record<string, unknown>>();
      return Response.json({ ...json, values: rawData }, { status: 400 });
    }
    return response;
  }
}
