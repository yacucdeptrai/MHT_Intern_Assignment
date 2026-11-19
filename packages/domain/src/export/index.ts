export const EXPORT_COLUMNS = [
  "Code",
  "Title",
  "Status",
  "Category",
  "Priority",
  "Assignees",
  "Sprint",
  "Start Date",
  "Due Date",
  "Overdue",
  "Created At",
  "Updated At",
] as const;

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Formula injection protection per FR-32 c2 and OWASP:
 * Prefixes cells beginning with =, +, -, @, \t, or \r with a single quote.
 */
export function sanitizeFormula(value: string): string {
  if (!value) return value;
  const firstChar = value.charAt(0);
  if (FORMULA_PREFIXES.includes(firstChar)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Escapes a single cell for CSV output:
 * First sanitizes for formula injection, then quotes and escapes if containing commas, quotes, or newlines.
 */
export function escapeCsvCell(cell: string): string {
  const sanitized = sanitizeFormula(cell);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Formats a 2D array of string cells into a CSV string with UTF-8 BOM.
 */
export function formatCsv(rows: string[][]): string {
  const BOM = "\uFEFF";
  const body = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\r\n");
  return BOM + body;
}
