import { describe, expect, it } from "vitest";

import { VALIDATION_MESSAGES } from "@pm/domain";
import en from "../../app/i18n/en.json";
import vi from "../../app/i18n/vi.json";

function extractLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const current = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...extractLeafKeys(value as Record<string, unknown>, current));
    } else {
      keys.push(current);
    }
  }
  return keys;
}

function findUsedKeysInCode(): Set<string> {
  const used = new Set<string>();
  // Vite bundles all files matching the glob as raw text strings
  const appModules = import.meta.glob<string>("../../app/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  const tCallRegex = /\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g;
  const keyPropRegex = /\bkey:\s*["']([a-zA-Z0-9_.]+)["']/g;

  for (const content of Object.values(appModules)) {
    let match: RegExpExecArray | null;
    while ((match = tCallRegex.exec(content)) !== null) {
      if (match[1]) {
        used.add(match[1]);
      }
    }
    while ((match = keyPropRegex.exec(content)) !== null) {
      if (match[1]) {
        used.add(match[1]);
      }
    }
  }

  // Include dynamic validation message keys generated from domain schemas
  for (const key of Object.keys(VALIDATION_MESSAGES)) {
    used.add(key);
  }

  // Include top-level action error keys
  const actionErrorKeys = [
    "errors.validation_failed",
    "errors.unauthorized",
    "errors.forbidden",
    "errors.not_found",
    "errors.conflict",
    "errors.internal",
  ];
  for (const k of actionErrorKeys) {
    used.add(k);
  }

  return used;
}

describe("i18n key integrity", () => {
  const enKeys = extractLeafKeys(en).sort();
  const viKeys = extractLeafKeys(vi).sort();

  it("en.json and vi.json must have the identical set of keys", () => {
    const missingInVi = enKeys.filter((k) => !viKeys.includes(k));
    const missingInEn = viKeys.filter((k) => !enKeys.includes(k));

    expect(missingInVi, "Keys present in en.json but missing in vi.json").toEqual([]);
    expect(missingInEn, "Keys present in vi.json but missing in en.json").toEqual([]);
  });

  it("every key used via t(...) in apps/web/app must exist in en.json", () => {
    const usedKeys = findUsedKeysInCode();
    const missingInDict = Array.from(usedKeys).filter((k) => !enKeys.includes(k));

    expect(missingInDict, "Keys used in code via t(...) but missing in en.json").toEqual([]);
  });

  it("every key defined in en.json must be used in code (no dead/unused keys)", () => {
    const usedKeys = findUsedKeysInCode();
    const unusedKeys = enKeys.filter((k) => !usedKeys.has(k));

    expect(unusedKeys, "Keys defined in en.json but not used anywhere in code").toEqual([]);
  });
});
