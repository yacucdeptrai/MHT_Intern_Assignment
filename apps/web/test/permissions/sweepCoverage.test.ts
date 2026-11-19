import { describe, expect, it } from "vitest";

/**
 * Keeps the non-member 404 sweep (nonMemberSweep.test.ts, docs/09 §3.1) complete: every
 * project-scoped route's loader and action must be swept. Adding a route without a sweep case
 * fails here instead of silently shipping an unchecked endpoint.
 */
const routeSources = import.meta.glob<string>("../../app/routes/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sweepSource = Object.values(
  import.meta.glob<string>("./nonMemberSweep.test.ts", { query: "?raw", import: "default", eager: true }),
)[0];

/** A route is project-scoped when its path carries a project or reaches project data by attachment. */
export function isProjectScoped(routeFile: string): boolean {
  const name = routeFile.split("/").pop() ?? "";
  return name.includes("$projectId") || name.startsWith("api.attachments.");
}

const exportPattern = (kind: "loader" | "action") =>
  new RegExp(`export\\s+(?:async\\s+)?function\\s+${kind}\\b|export\\s+const\\s+${kind}\\b`);

/** Names imported from app/loaders (for a loader) or app/actions (for an action). */
function delegatedFunctions(source: string, kind: "loader" | "action"): string[] {
  const folder = kind === "loader" ? "loaders" : "actions";
  const names: string[] = [];
  for (const match of source.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"\\.\\./${folder}/[^"]+"`, "g"))) {
    for (const part of (match[1] ?? "").split(",")) {
      const local = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local && !local.startsWith("type ")) names.push(local);
    }
  }
  return names;
}

export function missingSweepTargets(sources: Record<string, string>, sweep: string): string[] {
  const sweptNames = new Set([...sweep.matchAll(/name:\s*"(\w+)"/g)].map((m) => m[1]));
  const missing: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    if (!isProjectScoped(file)) continue;
    const base = (file.split("/").pop() ?? "").replace(/\.tsx?$/, "");
    for (const kind of ["loader", "action"] as const) {
      if (!exportPattern(kind).test(source)) continue;
      const delegated = delegatedFunctions(source, kind);
      if (delegated.length > 0) {
        for (const name of delegated) if (!sweptNames.has(name)) missing.push(`${base} ${kind} -> ${name}`);
      } else {
        const direct = new RegExp(
          `\\{\\s*${kind}\\s+as\\s+\\w+\\s*\\}\\s*from\\s*"\\.\\./\\.\\./app/routes/${base.replace(/\$/g, "\\$")}"`,
        );
        if (!direct.test(sweep)) missing.push(`${base} ${kind} (defined in the route module)`);
      }
    }
  }
  return missing;
}

describe("non-member 404 sweep coverage (docs/09 §3.1, NFR-02)", () => {
  it("finds the project-scoped routes to check", () => {
    const scoped = Object.keys(routeSources).filter(isProjectScoped);
    expect(scoped.length).toBeGreaterThanOrEqual(10);
  });

  it("every project-scoped route loader and action is in the non-member sweep", () => {
    expect(missingSweepTargets(routeSources, sweepSource ?? "")).toEqual([]);
  });

  it("reports a project-scoped route whose loader is not swept", () => {
    const fakeRoute = {
      "../../app/routes/_app.projects.$projectId.new-thing.tsx": [
        'import { newThingLoader } from "../loaders/newThingLoader";',
        "export async function loader() { return newThingLoader(); }",
      ].join("\n"),
    };
    expect(missingSweepTargets(fakeRoute, sweepSource ?? "")).toEqual([
      "_app.projects.$projectId.new-thing loader -> newThingLoader",
    ]);
  });
});
