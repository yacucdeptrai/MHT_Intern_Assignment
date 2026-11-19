import { describe, expect, it } from "vitest";

import regressionMap from "./regressionMap.json";

interface RegressionEntry {
  lesson: string;
  preventedBy: string;
  provenBy: string;
  testFile?: string;
  testName?: string;
  lintRule?: string;
}

const map = regressionMap as Record<string, RegressionEntry>;

const allFiles = import.meta.glob<string>(
  ["./**/*.ts", "../e2e/**/*.ts", "../../../packages/**/*.ts", "../../../eslint.config.js"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

function normalizePath(repoPath: string): string {
  if (repoPath.startsWith("apps/web/test/")) {
    return `./${repoPath.slice("apps/web/test/".length)}`;
  }
  if (repoPath.startsWith("apps/web/e2e/")) {
    return `../e2e/${repoPath.slice("apps/web/e2e/".length)}`;
  }
  if (repoPath.startsWith("packages/")) {
    return `../../../packages/${repoPath.slice("packages/".length)}`;
  }
  return repoPath;
}

const eslintContent = allFiles["../../../eslint.config.js"] ?? "";

describe("regressionMap (docs/09 §6)", () => {
  it("contains all 18 review lessons from 01 to 18", () => {
    for (let i = 1; i <= 18; i++) {
      const id = i.toString().padStart(2, "0");
      expect(map[id], `Missing lesson ID ${id}`).toBeDefined();
    }
  });

  for (let i = 1; i <= 18; i++) {
    const id = i.toString().padStart(2, "0");
    const entry = map[id];
    if (!entry) continue;

    it(`lesson ${id}: ${entry.lesson}`, () => {
      if (entry.testFile) {
        const globKey = normalizePath(entry.testFile);
        const fileContent = allFiles[globKey];
        expect(fileContent, `Referenced test file "${entry.testFile}" does not exist`).toBeDefined();

        if (entry.testName) {
          expect(
            fileContent?.includes(entry.testName),
            `Referenced test name "${entry.testName}" not found in file "${entry.testFile}"`,
          ).toBe(true);
        }
      }

      if (entry.lintRule) {
        expect(
          eslintContent.includes(entry.lintRule),
          `Referenced lint rule "${entry.lintRule}" not found in eslint.config.js`,
        ).toBe(true);
      }
    });
  }

  it("fails when a referenced test file, test name, or lint rule does not exist", () => {
    const fakeFile = normalizePath("apps/web/test/doesNotExist.test.ts");
    expect(allFiles[fakeFile]).toBeUndefined();

    const realFile = normalizePath("apps/web/test/logger.test.ts");
    const realContent = allFiles[realFile];
    expect(realContent?.includes("nonExistentTestNameXYZ")).toBe(false);

    expect(eslintContent.includes("non-existent-eslint-rule-xyz")).toBe(false);
  });
});
