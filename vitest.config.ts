import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/domain", "packages/db", "apps/web"],
    coverage: {
      provider: "istanbul",
      reporter: ["text-summary", "html"],
      include: ["packages/domain/src/**/*.ts", "packages/db/src/**/*.ts", "apps/web/app/services/**/*.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
