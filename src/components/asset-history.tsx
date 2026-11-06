import { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { ResultText } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/lift/format";
import { fileKindLabel } from "@/lib/lift/file-kind";
import { fetchCompanyFile } from "@/lib/lift/files-client";
import type { FileRow, InspectionRow } from "@/lib/lift/types";
import { cn } from "@/lib/utils";

type HistoryEvent =
  | { kind: "inspection"; date: string; inspection: InspectionRow; files: FileRow[] }
  | { kind: "file"; date: string; file: FileRow };

function buildEvents(inspections: InspectionRow[], files: FileRow[]): HistoryEvent[] {
  const byInspection = new Map<string, FileRow[]>();
  const loose: FileRow[] = [];
  const known = new Set(inspections.map((row) => row.id));
  for (const file of files) {
    if (file.kind === "asset") continue;
    if (file.inspectionId && known.has(file.inspectionId)) {
      const list = byInspection.get(file.inspectionId) ?? [];
      list.push(file);
      byInspection.set(file.inspectionId, list);
    } else {
      loose.push(file);
    }
  }
  const events: HistoryEvent[] = [
    ...inspections.map((inspection) => ({
      kind: "inspection" as const,
      date: inspection.inspectionDate,
      inspection,
      files: byInspection.get(inspection.id) ?? [],
    })),
    ...loose.map((file) => ({
      kind: "file" as const,
      date: file.uploadedOn,
      file,
    })),
  ];
  events.sort((a, b) => {
    const left = a.date || "0000-00-00";
    const right = b.date || "0000-00-00";
    if (left !== right) return left < right ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "inspection" ? -1 : 1;
    return 0;
  });
  return events;
}

function relativeWhen(iso: string, fresh: boolean): string | null {
  if (fresh) return "Just added";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  const then = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return "1 year ago";
  return `${Math.floor(days / 365)} years ago`;
}

const DOT: Record<string, string> = {
  pass: "bg-[#059669]",
  fail: "bg-[#DC2626]",
  conditional: "bg-[#D97706]",
  file: "bg-[#6B7280]",
};

export function AssetHistory({
  inspections,
  files,
  freshId,
}: {
  inspections: InspectionRow[];
  files: FileRow[];
  freshId?: string | null;
}) {
  const events = useMemo(() => buildEvents(inspections, files), [inspections, files]);
  const photoIds = useMemo(
    () => files.filter((file) => file.kind === "inspection" && file.byteSize > 0).map((file) => file.id),
    [files],
  );
  const photoUrls = useImageMap(photoIds);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string; mime: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  async function toggle(file: FileRow) {
    if (openId === file.id) {
      setOpenId(null);
      return;
    }
    if (file.byteSize <= 0) return;
    setError(null);
    if (preview?.id === file.id) {
      setOpenId(file.id);
      return;
    }
    setPendingId(file.id);
    try {
      const next = await fetchCompanyFile(file.id);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { id: file.id, url: next.url, mime: next.mime };
      });
      setOpenId(file.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that file.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-sheet border border-line bg-card p-4">
      <h2 className="font-display text-2xl tracking-tight">History</h2>
      <p className="mt-2 text-sm text-muted">Inspections, certificates, and wear photos.</p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4">
          {events.map((event) => {
            const dot = event.kind === "inspection" ? DOT[event.inspection.result] : DOT.file;
            const key = event.kind === "inspection" ? event.inspection.id : event.file.id;
            const fresh = event.kind === "inspection" && event.inspection.id === freshId;
            const expanded = expandedId === key;
            return (
              <li
                key={key}
                id={event.kind === "inspection" ? `inspection-${event.inspection.id}` : undefined}
                className={cn("relative border-l border-line", fresh && "bg-inset")}
              >
                {event.kind === "inspection" ? (
                  <InspectionEvent
                    event={event}
                    fresh={fresh}
                    expanded={expanded}
                    onToggleRow={() => setExpandedId(expanded ? null : key)}
                    openId={openId}
                    preview={preview}
                    pendingId={pendingId}
                    photoUrls={photoUrls}
                    onToggle={toggle}
                  />
                ) : (
                  <div className="py-3 pr-4 pl-4">
                    <div className="flex items-baseline justify-between gap-3 pr-2">
                      <p className="text-sm font-medium">{fileKindLabel(event.file.mimeType)}</p>
                      <span className="tabular-nums text-sm text-muted">{formatDate(event.file.uploadedOn)}</span>
                    </div>
                    <span className={cn("absolute top-4 left-0 size-2 -translate-x-1/2 rounded-full", dot)} aria-hidden />
                    <div className="mt-2">
                      <FileLine file={event.file} open={openId === event.file.id} pending={pendingId === event.file.id} preview={preview} onToggle={toggle} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function InspectionEvent({
  event,
  fresh,
  expanded,
  onToggleRow,
  openId,
  preview,
  pendingId,
  photoUrls,
  onToggle,
}: {
  event: Extract<HistoryEvent, { kind: "inspection" }>;
  fresh: boolean;
  expanded: boolean;
  onToggleRow: () => void;
  openId: string | null;
  preview: { id: string; url: string; mime: string } | null;
  pendingId: string | null;
  photoUrls: Record<string, string>;
  onToggle: (file: FileRow) => void;
}) {
  const row = event.inspection;
  const photos = event.files.filter((file) => file.kind === "inspection");
  const docs = event.files.filter((file) => file.kind !== "inspection");
  const when = relativeWhen(row.inspectionDate, fresh);
  const dot = DOT[row.result] ?? DOT.file;
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggleRow}
        className="grid w-full -ml-2 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 py-3 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="col-start-2 row-start-1 flex min-w-0 items-baseline justify-between gap-3 pr-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <ResultText result={row.result} />
            {when ? <span className="text-xs text-muted">{when}</span> : null}
          </span>
          <span className="shrink-0 tabular-nums text-sm text-muted">{formatDate(row.inspectionDate)}</span>
        </span>
        <span className="col-start-1 row-start-2 flex items-center justify-center self-center" aria-hidden>
          <span className={cn("size-2 rounded-full", dot)} />
        </span>
        <p className="col-start-2 row-start-2 min-w-0 text-sm text-muted">
          {row.inspectorName}
          {row.jobReference ? ` · ${row.jobReference}` : ""}
          {row.nextDueDate ? ` · next ${formatDate(row.nextDueDate)}` : ""}
        </p>
      </button>
      {expanded ? (
        <div className="pb-3 pr-4 pl-4">
          {row.notes ? <p className="text-pretty text-sm">{row.notes}</p> : null}
          {photos.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Wear/damage</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((photo) => (
                  <li key={photo.id} className="overflow-hidden rounded-md border border-[#E5E7EB] bg-white">
                    {photoUrls[photo.id] ? (
                      <img
                        src={photoUrls[photo.id]}
                        alt={photo.caption || "Wear/damage"}
                        className="aspect-[4/3] w-full bg-[#F8F9FB] object-contain"
                      />
                    ) : (
                      <div className="aspect-[4/3] animate-pulse bg-[#F3F4F6]" />
                    )}
                    {photo.caption ? <p className="px-2 py-1.5 text-xs text-[#374151]">{photo.caption}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {docs.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Certificate</p>
              <ul className="mt-2 grid gap-2">
                {docs.map((file) => (
                  <li key={file.id}>
                    <FileLine
                      file={file}
                      open={openId === file.id}
                      pending={pendingId === file.id}
                      preview={preview}
                      onToggle={onToggle}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button type="button" onClick={onToggleRow} className="mt-3 text-sm font-medium text-muted">
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FileLine({
  file,
  open,
  pending,
  preview,
  onToggle,
}: {
  file: FileRow;
  open: boolean;
  pending: boolean;
  preview: { id: string; url: string; mime: string } | null;
  onToggle: (file: FileRow) => void;
}) {
  const image = file.mimeType.startsWith("image/");
  const Icon = image ? ImageIcon : FileText;
  const showing = open && preview?.id === file.id ? preview : null;
  return (
    <div className="rounded-control bg-inset/60 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <Icon className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 break-all font-medium">{file.fileName}</span>
          <span className="shrink-0 tabular-nums text-muted">{formatBytes(file.byteSize)}</span>
        </p>
        {file.byteSize > 0 ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => void onToggle(file)}>
            {pending ? "Opening…" : open ? "Hide" : "View"}
          </Button>
        ) : (
          <p className="text-sm text-muted">No file stored</p>
        )}
      </div>
      {showing ? (
        <div className="mt-3 grid gap-2">
          {showing.mime.startsWith("image/") ? (
            <img src={showing.url} alt={file.fileName} className="max-h-80 w-full rounded-control object-contain bg-card" />
          ) : (
            <iframe title={file.fileName} src={showing.url} className="h-96 w-full rounded-control border border-line bg-card" />
          )}
          <a href={showing.url} download={file.fileName} className="text-sm font-medium text-accent">
            Download
          </a>
        </div>
      ) : null}
    </div>
  );
}

function useImageMap(ids: string[]): Record<string, string> {
  const key = ids.slice().sort().join(",");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) {
      setUrls({});
      return;
    }
    let cancelled = false;
    const owned: string[] = [];
    void Promise.all(
      key.split(",").map(async (id) => {
        try {
          const loaded = await fetchCompanyFile(id);
          owned.push(loaded.url);
          return [id, loaded.url] as const;
        } catch {
          return null;
        }
      }),
    )
      .then((pairs) => {
        if (cancelled) {
          owned.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setUrls(Object.fromEntries(pairs.filter((pair) => pair !== null)));
      });
    return () => {
      cancelled = true;
      owned.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);
  return urls;
}
