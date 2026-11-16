import { redirect } from "react-router";

import { destroySession, getSession, isRequestSecure } from "../utils/session.server";

export async function logoutAction(request: Request, secret?: string): Promise<Response> {
  const session = await getSession(request, secret);
  const secure = isRequestSecure(request);
  const cookie = await destroySession(session, { secret, secure });

  return redirect("/login", {
    headers: {
      "Set-Cookie": cookie,
    },
  });
}
