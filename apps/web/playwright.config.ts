import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// The dev server reads .dev.vars; load the same file so tests use the seeded admin credentials.
// Variables already set in the environment take precedence.
const devVarsPath = fileURLToPath(new URL(".dev.vars", import.meta.url));
if (existsSync(devVarsPath)) {
  process.loadEnvFile(devVarsPath);
}

const PORT = 4173;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A fresh runner has an empty local D1, so apply migrations before the dev server starts.
    command: `pnpm run db:migrate:local && pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
