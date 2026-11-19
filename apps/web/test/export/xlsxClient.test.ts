import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { buildXlsx } from "../../app/utils/xlsxExport.client";

describe("buildXlsx client utility (FR-32)", () => {
  it("builds a valid XLSX workbook with exact header, row count N+1, and string cells without formulas", async () => {
    const columns = ["Code", "Title", "Status", "Priority"];
    const rows = [
      ["PRJ-1", "Standard Task", "To Do", "MEDIUM"],
      ["PRJ-2", "'=SUM(A1)", "Done", "LOW"],
    ];

    const bytes = await buildXlsx(columns, rows);
    expect(bytes).toBeInstanceOf(Uint8Array);

    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0] ?? "";
    expect(sheetName).toBe("Tasks");

    const sheet = workbook.Sheets[sheetName] ?? {};
    const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    // Assert header row
    expect(sheetRows[0]).toEqual(columns);

    // Assert row count of N + 1 (header + 2 rows = 3)
    expect(sheetRows.length).toBe(3);

    // Assert rows match
    expect(sheetRows[1]).toEqual(rows[0]);
    expect(sheetRows[2]).toEqual(rows[1]);

    // Assert that the sanitized cell is still the literal string "'=SUM(A1)" with no formula (cell.f undefined)
    const formulaCell = sheet["B3"] as XLSX.CellObject | undefined;
    expect(formulaCell).toBeDefined();
    expect(formulaCell?.v).toBe("'=SUM(A1)");
    expect(formulaCell?.t).toBe("s");
    expect(formulaCell?.f).toBeUndefined();
  });
});
