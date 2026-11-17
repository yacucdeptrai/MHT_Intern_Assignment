// Enforces the commit standards in AGENTS.md §0.2, §0.3, and §3.2.
const AI_ATTRIBUTION = [
  /^co-authored-by:/im,
  /\b(claude|anthropic|copilot|chatgpt|gpt-\d|gemini|antigravity)\b/i,
  /generated (by|with) (ai|an ai)/i,
];

/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-ai-attribution": ({ raw }) => {
          const match = AI_ATTRIBUTION.find((pattern) => pattern.test(raw ?? ""));
          return [!match, "commit messages must not contain Co-authored-by trailers, agent names, or AI attributions"];
        },
      },
    },
  ],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "refactor", "chore", "test", "docs", "style", "perf", "ci"]],
    "scope-case": [2, "always", "lower-case"],
    "header-max-length": [2, "always", 72],
    "no-ai-attribution": [2, "always"],
  },
};
