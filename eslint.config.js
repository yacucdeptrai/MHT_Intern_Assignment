import js from "@eslint/js";
import i18nextPlugin from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Modules that @pm/domain must never import: it stays pure TypeScript (docs/02-architecture.md §2.1). */
const DOMAIN_FORBIDDEN = [
  "drizzle-orm",
  "drizzle-orm/*",
  "react-router",
  "react-router/*",
  "@react-router/*",
  "@cloudflare/*",
  "cloudflare:*",
  "@pm/*",
];

/** Modules that @pm/db must never import: no web app or HTTP layer. */
const DB_FORBIDDEN = ["@pm/web", "@pm/web/*", "react-router", "react-router/*", "@react-router/*"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.react-router/**",
      "**/.wrangler/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/worker-configuration.d.ts",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Review lessons #4, #6, #7, #12 (docs/09-testing-strategy.md §6)
      "no-sequences": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/only-throw-error": ["error", { allow: ["Response"] }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "no-console": "error",
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: DOMAIN_FORBIDDEN, message: "@pm/domain must stay pure: no infrastructure or workspace imports." },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: DB_FORBIDDEN, message: "@pm/db must not depend on the web app or the HTTP layer." }] },
      ],
    },
  },
  {
    files: [
      "apps/web/app/services/**/*.ts",
      "apps/web/app/routes/**/*.ts",
      "apps/web/app/routes/**/*.tsx",
      "apps/web/worker/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "xlsx",
              message:
                "Do not import SheetJS (xlsx) on the server. Build .xlsx in the browser to respect Workers Free 10ms CPU limit.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/app/components/i18n/**/*.{ts,tsx}",
      "apps/web/app/components/layouts/**/*.{ts,tsx}",
      "apps/web/app/components/task/**/*.{ts,tsx}",
      "apps/web/app/routes/login.tsx",
      "apps/web/app/routes/invite.$token.tsx",
      "apps/web/app/routes/_app.projects._index.tsx",
      "apps/web/app/routes/_app.projects.new.tsx",
      "apps/web/app/routes/_app.projects.$projectId.tsx",
      "apps/web/app/routes/_app.projects.$projectId._index.tsx",
      "apps/web/app/routes/_app.projects.$projectId.members.tsx",
      "apps/web/app/routes/_app.projects.$projectId.settings.tsx",
      "apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx",
      "apps/web/app/routes/_app.projects.$projectId.sprints.tsx",
      "apps/web/app/routes/_app.projects.$projectId.reports.tsx",
      "apps/web/app/routes/_app._index.tsx",
      "apps/web/app/routes/_app.my-tasks.tsx",
      "apps/web/app/routes/_app.calendar.tsx",
      "apps/web/app/routes/_app.notifications.tsx",
      "apps/web/app/routes/_app.profile.tsx",
      "apps/web/app/routes/_app.admin._index.tsx",
      "apps/web/app/routes/_app.admin.users.tsx",
      "apps/web/app/routes/_app.admin.statuses.tsx",
      "apps/web/app/routes/_app.admin.audit-log.tsx",
    ],
    plugins: {
      i18next: i18nextPlugin,
    },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            include: ["title", "placeholder", "aria-label", "alt"],
          },
        },
      ],
    },
  },
);
