import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { logoutAction } from "../actions/logoutAction";
import { requestContextKey } from "../utils/requestContext.server";

export function loader() {
  return redirect("/login");
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return logoutAction(request, ctx.env.SESSION_SECRET);
}

export default function LogoutRoute() {
  return null;
}
