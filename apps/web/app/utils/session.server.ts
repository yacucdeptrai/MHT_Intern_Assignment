import { createCookieSessionStorage } from "react-router";

import { SESSION_MAX_AGE_S } from "@pm/domain";

export interface SessionData {
  userId: string;
}

export interface SessionFlashData {
  error: string;
}

export interface SessionStorageOptions {
  secret?: string;
  secure?: boolean;
}

const DEFAULT_SECRET = "dev-session-secret-at-least-32-chars-long";

export function isRequestSecure(request?: Request | null): boolean {
  if (!request) {
    return false;
  }
  try {
    const url = new URL(request.url);
    if (url.protocol === "https:") {
      return true;
    }
    const protoHeader = request.headers.get("x-forwarded-proto");
    return protoHeader === "https";
  } catch {
    return false;
  }
}

export function getSessionStorage(options?: string | SessionStorageOptions) {
  const secret = typeof options === "string" ? options : (options?.secret ?? DEFAULT_SECRET);
  const isSecure = typeof options === "object" && options.secure !== undefined ? options.secure : false;

  return createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__session",
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_S,
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      secure: isSecure,
    },
  });
}

export async function getSession(request?: Request | null, secret?: string) {
  const cookie = request?.headers.get("Cookie");
  const secure = isRequestSecure(request);
  return getSessionStorage({ secret, secure }).getSession(cookie);
}

export async function commitSession(
  session: Awaited<ReturnType<ReturnType<typeof getSessionStorage>["getSession"]>>,
  options?: string | SessionStorageOptions,
) {
  return getSessionStorage(options).commitSession(session);
}

export async function destroySession(
  session: Awaited<ReturnType<ReturnType<typeof getSessionStorage>["getSession"]>>,
  options?: string | SessionStorageOptions,
) {
  return getSessionStorage(options).destroySession(session);
}
