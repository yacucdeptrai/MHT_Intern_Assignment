import { createCookieSessionStorage } from "react-router";

import { SESSION_MAX_AGE_S } from "@pm/domain";

export interface SessionData {
  userId: string;
}

export interface SessionFlashData {
  error: string;
}

const DEFAULT_SECRET = "dev-session-secret-at-least-32-chars-long";

export function getSessionStorage(secret = DEFAULT_SECRET) {
  return createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__session",
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_S,
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      secure: secret !== DEFAULT_SECRET,
    },
  });
}

export async function getSession(request?: Request | null, secret?: string) {
  const cookie = request?.headers.get("Cookie");
  return getSessionStorage(secret).getSession(cookie);
}

export async function commitSession(
  session: Awaited<ReturnType<ReturnType<typeof getSessionStorage>["getSession"]>>,
  secret?: string,
) {
  return getSessionStorage(secret).commitSession(session);
}

export async function destroySession(
  session: Awaited<ReturnType<ReturnType<typeof getSessionStorage>["getSession"]>>,
  secret?: string,
) {
  return getSessionStorage(secret).destroySession(session);
}
