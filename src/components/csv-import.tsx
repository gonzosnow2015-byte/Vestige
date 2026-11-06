import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CSV_COLUMNS,
  CSV_TEMPLATE,
  previewAssetCsv,
  previewAssetTable,
  rowsToImport,
  type ImportMode,
  type PreviewRow,
} from "@/lib/lift/csv";
import { assetTemplateXlsx, readFirstSheet } from "@/lib/lift/xlsx";
import { importAssets } from "@/lib/lift/server";
import { STATUS_LABEL, type ImportSummary } from "@/lib/lift/types";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<PreviewRow["action"], string> = {
  add: "Add",
  update: "Update",
  skip: "Skip",
  error: "Error",
};

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vestige-assets.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadExcelTemplate() {
  const blob = await assetTemplateXlsx();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vestige-assets.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

type ImportSource = { kind: "csv"; text: string } | { kind: "sheet"; rows: string[][] };

export function CsvImport({
  existingPartNumbers,
  onImported,
  onCancel,
}: {
  existingPartNumbers: string[];
  onImported: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>("skip");
  const [source, setSource] = useState<ImportSource | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [lockedParts, setLockedParts] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  const preview = useMemo(() => {
    if (!source) return null;
    const parts = lockedParts ?? existingPartNumbers;
    return source.kind === "csv"
      ? previewAssetCsv(source.text, parts, mode)
      : previewAssetTable(source.rows, parts, mode);
  }, [source, existingPartNumbers, lockedParts, mode]);
  const ready = preview && !preview.error ? rowsToImport(preview.rows) : [];
  const counts = {
    add: preview?.rows.filter((row) => row.action === "add").length ?? 0,
    update: preview?.rows.filter((row) => row.action === "update").length ?? 0,
    skip: preview?.rows.filter((row) => row.action === "skip").length ?? 0,
    error: preview?.rows.filter((row) => row.action === "error").length ?? 0,
  };

  async function onFile(file: File | undefined) {
    setSummary(null);
    setLockedParts(null);
    setReadError(null);
    setSource(null);
    if (!file) return;
    setFileName(file.name);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
        setReadError("Older .xls workbooks are not supported. Save as .xlsx or .csv.");
        return;
      }
      if (name.endsWith(".xlsx")) {
        const sheet = await readFirstSheet(await file.arrayBuffer());
        if (sheet.error) {
          setReadError(sheet.error);
          return;
        }
        setSource({ kind: "sheet", rows: sheet.rows });
        return;
      }
      if (name.endsWith(".csv") || file.type === "text/csv") {
        setSource({ kind: "csv", text: await file.text() });
        return;
      }
      setReadError("Use a .csv or .xlsx file.");
    } catch {
      setReadError("Could not read that file.");
    }
  }

  async function onConfirm() {
    if (!preview || preview.error) return;
    const failed = preview.rows
      .filter((row) => row.action === "error")
      .map((row) => ({ partNumber: row.partNumber, message: row.message ?? "This row is not valid." }));
    if (ready.length === 0) {
      setLockedParts(existingPartNumbers);
      setSummary({ created: 0, updated: 0, skipped: counts.skip, failed });
      return;
    }
    setPending(true);
    setReadError(null);
    try {
      const result = await importAssets({
        data: {
          mode,
          rows: preview.rows.flatMap((row) => (row.input ? [row.input] : [])),
        },
      });
      setLockedParts(existingPartNumbers);
      setSummary({ ...result, failed: [...failed, ...result.failed] });
      onImported();
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Could not import the file.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-sheet border border-line bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Import assets</h2>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-muted">
            CSV or Excel (.xlsx). The first sheet is used and the first row is the header. Inspections are not
            imported. Columns: {CSV_COLUMNS.join(", ")}. A type column is accepted as the title. Status is
            in_service, quarantine, out_of_service, or scrapped. Dates are YYYY-MM-DD. An Excel date cell is read
            the same way.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadCsvTemplate}>
            CSV template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void downloadExcelTemplate().catch(() => {
                setReadError("Could not build the Excel template.");
              });
            }}
          >
            Excel template
          </Button>
        </div>
      </div>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">CSV or Excel file</span>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void onFile(event.target.files?.[0])}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-inset file:px-3 file:text-sm file:font-medium file:text-ink"
        />
        {fileName ? <span className="text-xs text-muted">{fileName}</span> : null}
      </label>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Duplicate part numbers">
        {(
          [
            ["skip", "Skip duplicates"],
            ["update", "Update duplicates"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-11 rounded-control px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              mode === value ? "bg-inset text-ink" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {mode === "skip"
          ? "A part number already in this company is left unchanged."
          : "A part number already in this company is replaced with the row from the file."}
      </p>
      {readError ? <p className="text-sm text-danger">{readError}</p> : null}
      {preview?.error ? <p className="text-sm text-danger">{preview.error}</p> : null}
      {preview && !preview.error ? (
        <>
          <p className="text-sm text-muted">
            {counts.add} to add · {counts.update} to update · {counts.skip} to skip · {counts.error} with errors
          </p>
          <div className="max-h-80 overflow-auto rounded-control border border-line">
            <table className="w-full min-w-xl border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-inset text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Part number</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Next due</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className="border-t border-line">
                    <td className="px-3 py-2 tabular-nums text-muted">{row.line}</td>
                    <td className="px-3 py-2 font-mono">{row.partNumber}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{row.input ? STATUS_LABEL[row.input.status] : row.statusLabel}</td>
                    <td className="px-3 py-2 tabular-nums">{row.nextDueDate}</td>
                    <td
                      className={cn(
                        "px-3 py-2",
                        row.action === "error" && "text-danger",
                        row.action === "add" && "text-accent",
                        row.action === "skip" && "text-muted",
                      )}
                    >
                      {ACTION_LABEL[row.action]}
                      {row.message ? ` · ${row.message}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {summary ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            Added {summary.created}. Updated {summary.updated}. Skipped {summary.skipped}.
            {summary.failed.length > 0 ? ` ${summary.failed.length} not imported.` : " None failed."}
          </p>
          {summary.failed.length > 0 ? (
            <ul className="grid gap-1 text-sm text-danger">
              {summary.failed.map((row, index) => (
                <li key={`${row.partNumber}-${index}`}>
                  {row.partNumber}: {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            pending ||
            summary !== null ||
            !preview ||
            Boolean(preview.error) ||
            preview.rows.length === 0 ||
            (ready.length === 0 && counts.skip === 0 && counts.error === 0)
          }
          onClick={() => void onConfirm()}
        >
          {pending
            ? "Importing…"
            : ready.length === 0
              ? "Confirm"
              : `Import ${ready.length} ${ready.length === 1 ? "asset" : "assets"}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Close
        </Button>
      </div>
    </section>
  );
}
