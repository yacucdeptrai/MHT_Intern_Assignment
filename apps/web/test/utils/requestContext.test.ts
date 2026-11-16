import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createRequestContext, requestContextKey } from "../../app/utils/requestContext.server";

describe("createRequestContext", () => {
  it("builds RequestContext with ray ID as requestId", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { "cf-ray": "ray-123456" },
    });
    const ctx = createRequestContext(env, { waitUntil: () => {} }, request);

    expect(ctx.requestId).toBe("ray-123456");
    expect(ctx.db).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.clock.now()).toBeInstanceOf(Date);
  });

  it("exports requestContextKey for RouterContextProvider", () => {
    expect(requestContextKey).toBeDefined();
  });
});
