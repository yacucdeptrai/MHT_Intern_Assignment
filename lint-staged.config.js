// Pre-commit checks scoped to staged files (AGENTS.md §3.5). The full suites still run in CI.
const quote = (files) => files.map((file) => JSON.stringify(file)).join(" ");

/** @type {import("lint-staged").Configuration} */
export default {
  "*.{ts,tsx,js,mjs,cjs}": ["eslint --max-warnings 0 --no-warn-ignored --fix", "prettier --write"],
  "*.{json,yml,yaml,css}": ["prettier --write"],
  "*.{ts,tsx,js,json,yml,yaml}": ["cspell --no-progress --no-must-find-files --gitignore"],
  // Runs only the unit tests that import a staged source or test file, once for all of them.
  "{apps,packages}/**/*.{ts,tsx}": (files) => {
    const unitFiles = files.filter((file) => !/[\\/]e2e[\\/]/.test(file));
    return unitFiles.length > 0 ? [`vitest related --run --maxWorkers=2 --passWithNoTests ${quote(unitFiles)}`] : [];
  },
};
