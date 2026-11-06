import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AssetForm, EMPTY_ASSET } from "@/components/asset-form";
import { CsvImport } from "@/components/csv-import";
import { AssetBadge } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, READINESS_LABEL, readiness, todayISO, type Readiness } from "@/lib/lift/format";
import { uploadCompanyFile } from "@/lib/lift/files-client";
import { createAsset, listAssets } from "@/lib/lift/server";
import { type AssetRow } from "@/lib/lift/types";
import { useWorkspace } from "@/lib/lift/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/")({
  component: AssetsPage,
});

type Filter = "all" | Readiness;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_service", label: READINESS_LABEL.in_service },
  { value: "due_soon", label: READINESS_LABEL.due_soon },
  { value: "overdue", label: READINESS_LABEL.overdue },
  { value: "out_of_service", label: READINESS_LABEL.out_of_service },
];

function rankText(value: string, needle: string): number {
  const text = value.toLowerCase();
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  if (text.includes(needle)) return 2;
  return 3;
}

function AssetsPage() {
  const workspace = useWorkspace();
  const canWrite = workspace.member.role !== "viewer";
  const isAdmin = workspace.member.role === "admin";
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [panel, setPanel] = useState<"assets" | "add" | "import">("assets");
  const [formKey, setFormKey] = useState(0);
  const today = todayISO();
  const partNumbers = useMemo(() => (assets ?? []).map((asset) => asset.partNumber), [assets]);

  function reload() {
    return listAssets()
      .then(setAssets)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load assets.");
      });
  }

  useEffect(() => {
    void reload();
  }, [workspace.company.id]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (assets ?? []).filter((asset) => {
      if (filter !== "all" && readiness(asset.status, asset.nextDueDate, today) !== filter) return false;
      if (!needle) return true;
      return rankText(asset.partNumber, needle) < 3 || rankText(asset.type, needle) < 3;
    });
    if (!needle) return filtered;
    return filtered
      .map((asset, index) => ({
        asset,
        index,
        rank: Math.min(rankText(asset.partNumber, needle), rankText(asset.type, needle)),
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((row) => row.asset);
  }, [assets, filter, query, today]);

  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="font-display text-4xl tracking-tight">Assets</h1>
        <p className="mt-2 text-muted">Part numbers are unique inside {workspace.company.name}.</p>
      </div>
      {canWrite ? (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Assets, add, or import">
          <Button
            type="button"
            variant={panel === "assets" ? "default" : "outline"}
            aria-pressed={panel === "assets"}
            onClick={() => {
              setNotice(null);
              setPanel("assets");
            }}
          >
            Assets
          </Button>
          <Button
            type="button"
            variant={panel === "add" ? "default" : "outline"}
            aria-pressed={panel === "add"}
            onClick={() => {
              setNotice(null);
              setPanel("add");
            }}
          >
            Add asset
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              variant={panel === "import" ? "default" : "outline"}
              aria-pressed={panel === "import"}
              disabled={!assets}
              onClick={() => {
                setNotice(null);
                setPanel("import");
              }}
            >
              Import
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-muted">View access. You cannot add gear.</p>
      )}
      {notice ? <p className="text-center text-sm text-muted">{notice}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {panel === "add" && canWrite ? (
        <AssetForm
          key={formKey}
          initial={EMPTY_ASSET}
          submitLabel="Save asset"
          onCancel={() => setFormKey((value) => value + 1)}
          onSubmit={async (values, photo) => {
            const asset = await createAsset({ data: values });
            if (photo) {
              try {
                await uploadCompanyFile({ assetId: asset.id, file: photo, kind: "asset" });
              } catch {
                // The asset is already saved. Don't append the upload error.
              }
            }
            setAssets((current) => (current ? [asset, ...current] : [asset]));
            setFormKey((value) => value + 1);
            setError(null);
            setNotice("Asset saved");
            setPanel("assets");
          }}
        />
      ) : null}
      {panel === "import" && isAdmin ? (
        <CsvImport
          existingPartNumbers={partNumbers}
          onCancel={() => setPanel("assets")}
          onImported={() => {
            void reload();
          }}
        />
      ) : null}
      {panel === "assets" || !canWrite ? (
        <>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Search</span>
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8.75rem]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Part No/Title"
                aria-label="Part No/Title"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={!assets}
                className="min-w-0 font-mono"
              />
              <Select
                aria-label="Status"
                value={filter}
                disabled={!assets}
                className="w-full text-sm"
                onChange={(event) => {
                  const next = event.target.value as Filter;
                  if (FILTERS.some((item) => item.value === next)) setFilter(next);
                }}
              >
                {FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <span className="text-xs text-muted">
              {assets
                ? query.trim()
                  ? `${visible.length} ${visible.length === 1 ? "match" : "matches"}`
                  : `${assets.length} in the register`
                : "Loading the register"}
            </span>
          </div>
          {!assets ? (
            <div className="h-40 animate-pulse rounded-sheet bg-inset" />
          ) : assets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Empty</p>
          ) : visible.length === 0 ? (
            <div className="rounded-sheet border border-line bg-card p-4">
              <h2 className="font-display text-2xl tracking-tight">Nothing matches.</h2>
              <p className="mt-2 text-sm text-muted">Try another part number or title, or clear the filter.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
              <div className="hidden border-b border-[#E5E7EB] bg-[#F8F9FB] px-4 py-2.5 text-xs font-medium text-[#6B7280] md:grid md:grid-cols-[minmax(8rem,1.15fr)_minmax(0,1.25fr)_4.75rem_minmax(0,1fr)_7.25rem_auto] md:items-center md:gap-3">
                <span>Part number</span>
                <span>Title</span>
                <span>SWL</span>
                <span>Location</span>
                <span>Next due</span>
                <span className="text-right">Status</span>
              </div>
              <ul>
                {visible.map((asset, index) => (
                  <AssetListItem key={asset.id} asset={asset} today={today} striped={index % 2 === 1} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function AssetListItem({ asset, today, striped }: { asset: AssetRow; today: string; striped: boolean }) {
  const mobileMeta = [asset.type, asset.swl, asset.location].filter(Boolean).join(" · ");
  return (
    <li className="border-b border-[#EEF1F4] last:border-b-0">
      <Link
        to="/app/assets/$assetId"
        params={{ assetId: asset.id }}
        className={cn(
          "grid grid-cols-1 gap-1 px-4 py-3.5 hover:bg-[#F4F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB] md:min-h-14 md:grid-cols-[minmax(8rem,1.15fr)_minmax(0,1.25fr)_4.75rem_minmax(0,1fr)_7.25rem_auto] md:items-center md:gap-3 md:py-0",
          striped && "bg-[#F8F9FB]",
        )}
      >
        <span className="flex items-start justify-between gap-3 md:block">
          <span className="break-all font-mono text-[15px] font-semibold leading-5 text-[#111827]">
            {asset.partNumber}
          </span>
          <span className="md:hidden">
            <AssetBadge status={asset.status} nextDue={asset.nextDueDate} today={today} />
          </span>
        </span>
        <span className="truncate text-sm text-[#6B7280] md:hidden">{mobileMeta}</span>
        <span className="hidden truncate text-sm text-[#6B7280] md:block">{asset.type}</span>
        <span className="hidden truncate text-sm text-[#6B7280] md:block">{asset.swl || "—"}</span>
        <span className="hidden truncate text-sm text-[#6B7280] md:block">{asset.location || "—"}</span>
        <span className="text-sm tabular-nums text-[#6B7280]">
          <span className="md:hidden">Next due </span>
          {formatDate(asset.nextDueDate)}
        </span>
        <span className="hidden justify-self-end md:block">
          <AssetBadge status={asset.status} nextDue={asset.nextDueDate} today={today} />
        </span>
      </Link>
    </li>
  );
}
