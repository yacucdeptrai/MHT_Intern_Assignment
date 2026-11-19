import type * as XLSXType from "xlsx";

/**
 * Builds an XLSX workbook in the browser using SheetJS.
 * Every cell is written explicitly as a string cell ({ t: "s", v: value })
 * to guarantee that no cell is interpreted or evaluated as a spreadsheet formula.
 */
export async function buildXlsx(columns: string[], rows: string[][]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const aoa = [columns, ...rows];

  const ws: XLSXType.WorkSheet = {};
  const range = {
    s: { c: 0, r: 0 },
    e: { c: Math.max(0, columns.length - 1), r: Math.max(0, aoa.length - 1) },
  };

  for (let R = 0; R < aoa.length; ++R) {
    const row = aoa[R];
    if (!row) continue;
    for (let C = 0; C < row.length; ++C) {
      const val = row[C] ?? "";
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      ws[cellRef] = { t: "s", v: val };
    }
  }

  ws["!ref"] = XLSX.utils.encode_range(range);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const arrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}
