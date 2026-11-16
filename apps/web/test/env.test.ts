import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("web Worker test environment", () => {
  it("loads vars from wrangler.jsonc", () => {
    expect(env.APP_ENV).toBe("local");
    expect(env.EMAIL_PROVIDER).toBe("console");
  });
});
