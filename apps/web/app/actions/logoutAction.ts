import { redirect } from "react-router";

import { destroySession, getSession } from "../utils/session.server";

export async function logoutAction(request: Request): Promise<Response> {
  const session = await getSession(request);
  const cookie = await destroySession(session);

  return redirect("/login", {
    headers: {
      "Set-Cookie": cookie,
    },
  });
}
