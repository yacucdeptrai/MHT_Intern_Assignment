import { z } from "zod";

export const ExportFormatSchema = z.enum(["csv", "rows"]);

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export interface ExportRowsResponse {
  columns: string[];
  rows: string[][];
  fileName: string;
}
