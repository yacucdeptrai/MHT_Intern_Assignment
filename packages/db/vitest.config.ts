import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [
    cloudflareTest(async () => ({
      main: "./test/testWorker.ts",
      miniflare: {
        compatibilityDate: "2026-11-13",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")) },
      },
    })),
  ],
  test: {
    name: "db",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/applyMigrations.ts"],
  },
});
