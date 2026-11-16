import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { AdminShell } from "../components/layouts/AdminShell";
import { MemberShell } from "../components/layouts/MemberShell";
import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);
  return { user };
}

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();

  if (user.systemRole === "ADMIN" || user.systemRole === "PM") {
    return (
      <AdminShell user={user}>
        <Outlet />
      </AdminShell>
    );
  }

  return (
    <MemberShell user={user}>
      <Outlet />
    </MemberShell>
  );
}
