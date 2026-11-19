#!/usr/bin/env bash
# Prints the raw facts a milestone report must be built from, straight from GitHub and git,
# so no PR state, SHA, run ID, or test name is ever written from memory (AGENTS.md §3.7).
#
# Usage:   scripts/milestone-report.sh <first-pr> <last-pr> [fr-pattern] [todo-prefix]
# Example: scripts/milestone-report.sh 52 57 'FR-3[0-5]' 'M8-'
#
# fr-pattern  an extended regex for the milestone's FR IDs (for example 'FR-3[0-5]').
#             Lists every test naming them and, when docs/01-srs.md exists, counts tests per
#             criterion and prints NOT TESTED for any criterion without a named test.
# todo-prefix lists the TODO markers left for that milestone prefix (for example M8-); there must be none at milestone end.
set -euo pipefail

first=${1:?usage: milestone-report.sh <first-pr> <last-pr> [fr-pattern] [todo-prefix]}
last=${2:?usage: milestone-report.sh <first-pr> <last-pr> [fr-pattern] [todo-prefix]}
fr=${3:-}
todo=${4:-}
test_paths=(apps/web/test apps/web/e2e packages)

git fetch --quiet --prune origin

echo "## Pull requests #${first}-#${last}"
for n in $(seq "$first" "$last"); do
  echo
  echo "### PR #${n}"
  echo "\$ gh pr view ${n} --json number,title,state,baseRefName,headRefOid,mergeCommit,mergedAt"
  gh pr view "$n" --json number,title,state,baseRefName,headRefOid,mergeCommit,mergedAt
  head_sha=$(gh pr view "$n" --json headRefOid -q .headRefOid)
  merge_sha=$(gh pr view "$n" --json mergeCommit -q '.mergeCommit.oid // ""')
  echo "\$ gh run list --commit ${head_sha} --workflow ci --limit 3"
  gh run list --commit "$head_sha" --workflow ci --limit 3
  if [ -n "$merge_sha" ]; then
    echo "\$ gh run list --commit ${merge_sha} --limit 5"
    gh run list --commit "$merge_sha" --limit 5
  else
    echo "(not merged)"
  fi
done

echo
echo "## develop"
echo "\$ git log --oneline -1 origin/develop"
git log --oneline -1 origin/develop

if [ -n "$fr" ]; then
  echo
  echo "## Tests naming ${fr}"
  echo "\$ git grep -n -E '(it|test)\\(\"[^\"]*(${fr})' -- ${test_paths[*]}"
  git grep -n -E "(it|test)\\(\"[^\"]*(${fr})" -- "${test_paths[@]}" || echo "(no matches)"

  if [ -f docs/01-srs.md ]; then
    echo
    echo "## Tests per criterion (from docs/01-srs.md)"
    # Test names may cover several criteria: "FR-31 c1–3", "FR-31 c1..c4", "FR-31 c1, c3",
    # "FR-29 c1 & c4". Ranges and lists are expanded before counting.
    git grep -h -E "(it|test)\\(\"[^\"]*(${fr})" -- "${test_paths[@]}" |
      FR_PATTERN="$fr" node -e '
        const fs = require("node:fs");
        const pattern = new RegExp(`^### (${process.env.FR_PATTERN}) `);
        const criteria = [];
        let current = null;
        for (const line of fs.readFileSync("docs/01-srs.md", "utf8").split("\n")) {
          if (line.startsWith("### ")) { current = pattern.test(line) ? line.split(" ")[1] : null; continue; }
          const m = current && line.match(/^\s+(\d+)\./);
          if (m) criteria.push(`${current} c${m[1]}`);
        }
        const counts = new Map(criteria.map((c) => [c, 0]));
        const names = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
        for (const name of names) {
          const covered = new Set();
          for (const m of name.matchAll(/(FR-\d+)\s+((?:c\d+(?:\s*(?:–|-|\.\.)\s*c?\d+)?(?:\s*(?:,|&|\/|and)\s*)?)+)/g)) {
            for (const part of m[2].split(/\s*(?:,|&|\/|and)\s*/)) {
              const r = part.match(/c(\d+)(?:\s*(?:–|-|\.\.)\s*c?(\d+))?/);
              if (!r) continue;
              const from = Number(r[1]);
              const to = r[2] ? Number(r[2]) : from;
              for (let i = from; i <= to; i++) covered.add(`${m[1]} c${i}`);
            }
          }
          for (const c of covered) if (counts.has(c)) counts.set(c, counts.get(c) + 1);
        }
        for (const [c, n] of counts) console.log(n === 0 ? `${c}: NOT TESTED` : `${c}: ${n} test(s)`);
      '
  fi
fi

if [ -n "$todo" ]; then
  echo
  echo "## TODO markers for ${todo}"
  echo "\$ git grep -n \"TODO(${todo}\""
  git grep -n "TODO(${todo}" || echo "(none; git grep exit 1)"
fi
