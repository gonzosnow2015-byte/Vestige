import { assetTemplateSheet } from "./csv.ts";

export const XLSX_BYTE_LIMIT = 5_000_000;

/** Turn one Excel cell into the text the CSV preview already understands. */
export function excelCellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return "";
}

export function excelSheetToTable(rows: readonly (readonly unknown[])[]): string[][] {
  return rows.map((row) => row.map((cell) => excelCellText(cell)));
}

export function xlsxReadError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/password|encrypt/i.test(message)) {
    return "That workbook is password-protected. Save it without a password and try again.";
  }
  return "That Excel file could not be read. Use the first sheet of an .xlsx file.";
}

/** First worksheet only. Dates become YYYY-MM-DD. */
export async function readFirstSheet(data: ArrayBuffer): Promise<{ error: string | null; rows: string[][] }> {
  if (data.byteLength > XLSX_BYTE_LIMIT) {
    return { error: "That file is too large. Split it and import up to 500 rows at a time.", rows: [] };
  }
  try {
    const { readSheet } = await import("read-excel-file/universal");
    const sheet = await readSheet(data);
    return { error: null, rows: excelSheetToTable(sheet) };
  } catch (error) {
    return { error: xlsxReadError(error), rows: [] };
  }
}

export async function assetTemplateXlsx(): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  return writeXlsxFile(assetTemplateSheet(), { sheet: "Assets" }).toBlob();
}
