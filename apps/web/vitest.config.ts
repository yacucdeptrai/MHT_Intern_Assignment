import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      main: "./test/testWorker.ts",
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "../../packages/db/migrations")),
        },
      },
    })),
  ],
  test: {
    name: "web",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setupD1.ts"],
  },
});
