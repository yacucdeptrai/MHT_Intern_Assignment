import { expect, test } from "@playwright/test";

test("health endpoint reports ok for the deploy smoke check", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, environment: "local" });
});
