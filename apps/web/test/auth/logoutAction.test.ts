import { describe, expect, it } from "vitest";

import { logoutAction } from "../../app/actions/logoutAction";
import { commitSession, getSession } from "../../app/utils/session.server";

describe("logoutAction", () => {
  it("clears session and redirects to /login on POST", async () => {
    const session = await getSession();
    session.set("userId", "user-to-logout");
    const cookie = await commitSession(session);

    const request = new Request("http://localhost/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const response = await logoutAction(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });

  it("clears session signed with custom secret and redirects to /login", async () => {
    const customSecret = "custom-logout-secret-32-chars-long";
    const session = await getSession(null, customSecret);
    session.set("userId", "user-to-logout-2");
    const cookie = await commitSession(session, customSecret);

    const request = new Request("http://localhost/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const response = await logoutAction(request, customSecret);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });
});
