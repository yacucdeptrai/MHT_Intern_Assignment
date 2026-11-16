import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { requireSystemRole, requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN", "PM"]);
  return { user };
}

export default function AdminLayoutGuard() {
  useLoaderData<typeof loader>();
  return <Outlet />;
}
