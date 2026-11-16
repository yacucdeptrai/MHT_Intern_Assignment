import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("test storage isolation", () => {
  it("does not see tables created by other test files", async () => {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'isolation_probe'").first<{
      n: number;
    }>();
    expect(row?.n).toBe(0);
  });
});
