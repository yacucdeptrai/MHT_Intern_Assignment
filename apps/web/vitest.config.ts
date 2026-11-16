import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [
    cloudflareTest({
      // Bindings and vars come from wrangler.jsonc; the app's own entry needs the React Router build,
      // so service and action tests run against a minimal test entry instead.
      wrangler: { configPath: "./wrangler.jsonc" },
      main: "./test/testWorker.ts",
    }),
  ],
  test: {
    name: "web",
    include: ["test/**/*.test.ts"],
  },
});
