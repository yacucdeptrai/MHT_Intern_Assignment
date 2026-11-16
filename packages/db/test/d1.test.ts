import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("local D1 test database", () => {
  it("answers queries", async () => {
    const row = await env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
    expect(row?.one).toBe(1);
  });

  it("writes inside this file only", async () => {
    await env.DB.exec("CREATE TABLE IF NOT EXISTS isolation_probe (id INTEGER PRIMARY KEY)");
    await env.DB.prepare("INSERT INTO isolation_probe (id) VALUES (1)").run();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM isolation_probe").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
