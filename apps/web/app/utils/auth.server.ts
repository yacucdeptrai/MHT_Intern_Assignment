import { redirect } from "react-router";

import { userRepository } from "@pm/db";
import type { SessionUser, SystemRole } from "@pm/domain";

import type { RequestContext } from "./requestContext.server";
import { destroySession, getSession, isRequestSecure } from "./session.server";

export function getSafeRedirect(target: string | null | undefined, defaultUrl = "/"): string {
  if (!target || typeof target !== "string") {
    return defaultUrl;
  }
  const trimmed = target.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
  ) {
    return defaultUrl;
  }
  return trimmed;
}

export async function getOptionalUser(ctx: RequestContext, request: Request): Promise<SessionUser | null> {
  const session = await getSession(request, ctx.env.SESSION_SECRET);
  const userId = session.get("userId");
  if (!userId) {
    return null;
  }

  const user = await userRepository.findById(ctx.db, userId);
  if (!user || user.status === "LOCKED") {
    return null;
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    systemRole: user.systemRole,
    status: user.status,
  };
  ctx.user = sessionUser;
  return sessionUser;
}

export async function requireUser(ctx: RequestContext, request: Request): Promise<SessionUser> {
  const session = await getSession(request, ctx.env.SESSION_SECRET);
  const userId = session.get("userId");
  const url = new URL(request.url);
  const returnUrl = url.pathname + url.search;

  if (!userId) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);
  }

  const user = await userRepository.findById(ctx.db, userId);
  if (!user || user.status === "LOCKED") {
    const isSecure = isRequestSecure(request) || ctx.env.APP_ENV === "production" || ctx.env.APP_ENV === "staging";
    const cookie = await destroySession(session, { secret: ctx.env.SESSION_SECRET, secure: isSecure });
    throw redirect("/login", {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    systemRole: user.systemRole,
    status: user.status,
  };
  ctx.user = sessionUser;
  return sessionUser;
}

export function requireSystemRole(user: SessionUser, roles: readonly SystemRole[]): SessionUser {
  if (!roles.includes(user.systemRole)) {
    throw new Response("You do not have permission to access this page", { status: 403 });
  }
  return user;
}
