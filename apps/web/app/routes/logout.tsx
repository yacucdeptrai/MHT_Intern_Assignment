import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { logoutAction } from "../actions/logoutAction";

export function loader() {
  return redirect("/login");
}

export async function action({ request }: ActionFunctionArgs) {
  return logoutAction(request);
}

export default function LogoutRoute() {
  return null;
}
