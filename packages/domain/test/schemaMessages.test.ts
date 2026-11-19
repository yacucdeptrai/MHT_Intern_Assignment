import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../src/constants";
import { getValidationMessageKey, VALIDATION_MESSAGES } from "../src/schemas/messages";

function extractMessageLiterals(dir: string): string[] {
  const files = fs.readdirSync(dir);
  const messages = new Set<string>();

  for (const file of files) {
    if (!file.endsWith(".ts") || file === "messages.ts") continue;
    const content = fs.readFileSync(path.join(dir, file), "utf8");

    const patterns = [
      /message:\s*["']([^"']+)["']/g,
      /\.min\(\s*[^,]+,\s*["']([^"']+)["']/g,
      /\.max\(\s*[^,]+,\s*["']([^"']+)["']/g,
      /\.regex\(\s*[^,]+,\s*["']([^"']+)["']/g,
      /\.email\(\s*["']([^"']+)["']/g,
      /\.int\(\s*["']([^"']+)["']/g,
      /\.positive\(\s*["']([^"']+)["']/g,
      /error:\s*["']([^"']+)["']/g,
    ];

    for (const pat of patterns) {
      for (const m of content.matchAll(pat)) {
        if (m[1]) messages.add(m[1]);
      }
    }

    // Template literals for password length
    const templatePatterns = [/min\([^,]+,\s*`([^`]+)`/g, /max\([^,]+,\s*`([^`]+)`/g];
    for (const pat of templatePatterns) {
      for (const m of content.matchAll(pat)) {
        if (m[1]) {
          const resolved = m[1]
            .replace("${PASSWORD_MIN_LENGTH}", String(PASSWORD_MIN_LENGTH))
            .replace("${PASSWORD_MAX_LENGTH}", String(PASSWORD_MAX_LENGTH));
          messages.add(resolved);
        }
      }
    }
  }

  return Array.from(messages);
}

describe("schema validation messages registry", () => {
  it("registers every message literal found in domain schemas", () => {
    const schemasDir = path.resolve(__dirname, "../src/schemas");
    const extracted = extractMessageLiterals(schemasDir);

    expect(extracted.length).toBeGreaterThan(0);

    const unregistered: string[] = [];
    for (const msg of extracted) {
      if (!getValidationMessageKey(msg)) {
        unregistered.push(msg);
      }
    }

    expect(unregistered).toEqual([]);
  });

  it("fails deliberately on an unregistered message", () => {
    const fakeMessage = "Deliberately unregistered schema validation message";
    expect(getValidationMessageKey(fakeMessage)).toBeUndefined();

    // Verify detection function catches it
    const testList = ["A reason is required", fakeMessage];
    const missing = testList.filter((msg) => !getValidationMessageKey(msg));
    expect(missing).toEqual([fakeMessage]);
  });

  it("has reciprocal mapping for all entries in registry", () => {
    expect(Object.keys(VALIDATION_MESSAGES).length).toBeGreaterThan(0);
    for (const [key, msg] of Object.entries(VALIDATION_MESSAGES)) {
      expect(getValidationMessageKey(msg)).toBe(key);
    }
  });
});
