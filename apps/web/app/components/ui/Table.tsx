import type { ReactNode } from "react";

import { cx } from "./cx";

export interface TableColumn<Row> {
  id: string;
  label: ReactNode;
  width?: number | string;
  align?: "left" | "right" | "center";
  /** Secondary text color for the cells */
  muted?: boolean;
  /** Allow wrapping (default: single line) */
  wrap?: boolean;
  render?: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  /** 34px rows instead of 40px */
  dense?: boolean;
  className?: string;
  rowTestId?: (row: Row) => string;
  "data-testid"?: string;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Hairline table with 32px header, 40px (or 34px dense) rows. */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  dense = false,
  className,
  rowTestId,
  "data-testid": testId,
}: TableProps<Row>) {
  return (
    <div className={cx("w-full overflow-x-auto", className)}>
      <table data-testid={testId} className="w-full border-collapse text-[13px] leading-[1.3] text-fg">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                style={{ width: column.width }}
                className={cx(
                  "h-8 whitespace-nowrap border-b border-line px-3 text-[12px] font-medium leading-none text-fg-muted",
                  ALIGN[column.align ?? "left"],
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-fg-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-testid={rowTestId?.(row)}
                onClick={
                  onRowClick
                    ? () => {
                        onRowClick(row);
                      }
                    : undefined
                }
                className={onRowClick ? "cursor-pointer hover:bg-hover" : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cx(
                      "border-b border-line px-3",
                      dense ? "h-[34px]" : "h-10",
                      ALIGN[column.align ?? "left"],
                      column.wrap ? "whitespace-normal py-2" : "whitespace-nowrap",
                      column.muted && "text-fg-secondary",
                    )}
                  >
                    {column.render ? column.render(row) : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
