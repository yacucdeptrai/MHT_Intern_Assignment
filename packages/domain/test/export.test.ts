import { describe, expect, it } from "vitest";

import { escapeCsvCell, formatCsv, sanitizeFormula } from "../src/export";

describe("Formula Injection Sanitizer (FR-32 c2 & OWASP)", () => {
  it("prefixes values starting with =, +, -, @, \\t, or \\r with a single quote", () => {
    expect(sanitizeFormula("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(sanitizeFormula("+12345")).toBe("'+12345");
    expect(sanitizeFormula("-12345")).toBe("'-12345");
    expect(sanitizeFormula("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    expect(sanitizeFormula("\tmalicious")).toBe("'\tmalicious");
    expect(sanitizeFormula("\rmalicious")).toBe("'\rmalicious");
  });

  it("leaves standard safe values unchanged", () => {
    expect(sanitizeFormula("Normal Title")).toBe("Normal Title");
    expect(sanitizeFormula("12345")).toBe("12345");
    expect(sanitizeFormula("")).toBe("");
  });
});

describe("CSV Formatter (FR-32 c1)", () => {
  it("properly quotes cells with commas, quotes, and line breaks", () => {
    const complexTitle = 'Title with "quotes", a comma, and a\nline break';
    const escaped = escapeCsvCell(complexTitle);
    expect(escaped).toBe('"Title with ""quotes"", a comma, and a\nline break"');
  });

  it("applies formula injection prefix and quotes if needed", () => {
    const formulaWithComma = "=SUM(A1, B1)";
    const escaped = escapeCsvCell(formulaWithComma);
    expect(escaped).toBe('"\'=SUM(A1, B1)"');
  });

  it("produces UTF-8 string starting with BOM", () => {
    const rows = [
      ["Code", "Title"],
      ["PRJ-1", "Test Task"],
    ];
    const csv = formatCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Code,Title\r\nPRJ-1,Test Task");
  });
});
