import { assetInput, ASSET_STATUSES, type AssetInput, type AssetStatus } from "./types.ts";

export const CSV_COLUMNS = [
  "part_number",
  "title",
  "description",
  "swl",
  "manufacturer",
  "serial_number",
  "location",
  "status",
  "next_due_date",
  "notes",
] as const;

const TEMPLATE_SAMPLE = [
  "BS-1042",
  "Bow shackle",
  "Green pin",
  "3.25 t",
  "Crosby",
  "1042",
  "Bay 2",
  "in_service",
  "2027-03-12",
  "",
];

export const CSV_TEMPLATE = [CSV_COLUMNS.join(","), TEMPLATE_SAMPLE.join(",")].join("\n");

/** Header plus one example row. Shared by the CSV and Excel templates. */
export function assetTemplateSheet(): string[][] {
  return [[...CSV_COLUMNS], [...TEMPLATE_SAMPLE]];
}

export const IMPORT_ROW_LIMIT = 500;

export type ImportMode = "skip" | "update";
export type ImportAction = "add" | "update" | "skip" | "error";

export type PreviewRow = {
  line: number;
  partNumber: string;
  type: string;
  statusLabel: string;
  nextDueDate: string;
  action: ImportAction;
  message: string | null;
  input: AssetInput | null;
};

export type CsvPreview = {
  error: string | null;
  rows: PreviewRow[];
};

const STATUS_SET = new Set<string>(ASSET_STATUSES);

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseStatus(raw: string): AssetStatus | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "") return "in_service";
  return STATUS_SET.has(key) ? (key as AssetStatus) : null;
}

/** RFC-style commas and quotes. Returns null when a quote is left open. */
export function parseCsv(text: string): string[][] | null {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < src.length; index += 1) {
    const char = src[index];
    if (inQuotes) {
      if (char === '"') {
        if (src[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (inQuotes) return null;
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function blank(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

export function previewAssetCsv(text: string, existingPartNumbers: Iterable<string>, mode: ImportMode): CsvPreview {
  if (text.length > 1_000_000) {
    return { error: "That file is too large. Split it and import up to 500 rows at a time.", rows: [] };
  }
  const table = parseCsv(text);
  if (!table) return { error: "A quote in the file is not closed.", rows: [] };
  return previewAssetTable(table, existingPartNumbers, mode);
}

/** Same rules as the CSV preview. `table` includes the header row. */
export function previewAssetTable(
  table: string[][],
  existingPartNumbers: Iterable<string>,
  mode: ImportMode,
): CsvPreview {
  const filled = table.filter((row) => !blank(row));
  if (filled.length === 0) return { error: "The file is empty.", rows: [] };

  const header = filled[0].map(normHeader);
  const missing = [
    ...(!header.includes("part_number") ? ["part_number"] : []),
    ...(!header.includes("title") && !header.includes("type") ? ["title"] : []),
  ];
  if (missing.length > 0) {
    return {
      error: `The header must include ${missing.join(" and ")}. A type column is accepted as the title. Expected columns: ${CSV_COLUMNS.join(", ")}.`,
      rows: [],
    };
  }
  const seenHeaders = new Set<string>();
  for (const column of header) {
    if (column === "") continue;
    if (seenHeaders.has(column)) return { error: `The column ${column} is repeated.`, rows: [] };
    seenHeaders.add(column);
  }

  const data = filled.slice(1);
  if (data.length > IMPORT_ROW_LIMIT) {
    return { error: `Import up to ${IMPORT_ROW_LIMIT} rows at a time.`, rows: [] };
  }
  if (data.length === 0) return { error: "The file has a header but no assets.", rows: [] };

  const existing = new Set<string>();
  for (const part of existingPartNumbers) existing.add(part.trim().toLowerCase());
  const seen = new Set<string>();
  const indexOf = (column: string) => header.indexOf(column);
  const cell = (row: string[], column: string) => {
    const index = indexOf(column);
    return index === -1 ? "" : (row[index] ?? "");
  };

  const rows: PreviewRow[] = data.map((raw, offset) => {
    const line = offset + 2;
    const partNumber = cell(raw, "part_number").trim();
    const titled = cell(raw, "title").trim();
    const type = titled || cell(raw, "type").trim();
    const statusRaw = cell(raw, "status");
    const nextDueRaw = cell(raw, "next_due_date").trim();
    const status = parseStatus(statusRaw);
    const base = {
      line,
      partNumber: partNumber || "—",
      type: type || "—",
      statusLabel: statusRaw.trim() || "In service",
      nextDueDate: nextDueRaw || "—",
    };
    if (!status) {
      return {
        ...base,
        action: "error" as const,
        message: "Status must be in_service, quarantine, out_of_service, or scrapped.",
        input: null,
      };
    }
    const parsed = assetInput.safeParse({
      partNumber,
      type,
      description: cell(raw, "description").trim(),
      swl: cell(raw, "swl"),
      manufacturer: cell(raw, "manufacturer"),
      serialNumber: cell(raw, "serial_number"),
      location: cell(raw, "location"),
      status,
      nextDueDate: nextDueRaw,
      notes: cell(raw, "notes"),
    });
    if (!parsed.success) {
      return {
        ...base,
        action: "error" as const,
        message: parsed.error.issues[0]?.message ?? "This row is not valid.",
        input: null,
      };
    }
    const key = parsed.data.partNumber.toLowerCase();
    if (seen.has(key)) {
      return {
        ...base,
        partNumber: parsed.data.partNumber,
        type: parsed.data.type,
        action: "error" as const,
        message: "This part number is already on an earlier row.",
        input: null,
      };
    }
    seen.add(key);
    const known = existing.has(key);
    const action: ImportAction = known ? (mode === "skip" ? "skip" : "update") : "add";
    return {
      line,
      partNumber: parsed.data.partNumber,
      type: parsed.data.type,
      statusLabel: statusRaw.trim() || "in_service",
      nextDueDate: parsed.data.nextDueDate ?? "—",
      action,
      message: null,
      input: parsed.data,
    };
  });

  return { error: null, rows };
}

export function rowsToImport(rows: PreviewRow[]): AssetInput[] {
  return rows.flatMap((row) => (row.input && (row.action === "add" || row.action === "update") ? [row.input] : []));
}
