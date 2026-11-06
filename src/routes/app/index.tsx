import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AssetBadge } from "@/components/status-pill";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ATTENTION_FILTERS,
  attentionCounts,
  formatDate,
  matchesAttention,
  todayISO,
  windowEnd,
  type AttentionFilter,
} from "@/lib/lift/format";
import { listAssets } from "@/lib/lift/server";
import type { AssetRow } from "@/lib/lift/types";
import { useWorkspace } from "@/lib/lift/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

const CARD_FILTERS: { id: AttentionFilter; label: string; detail: (today: string) => string | null }[] = [
  { id: "all", label: "Assets", detail: () => "On the register" },
  { id: "overdue", label: "Overdue", detail: () => "Before today" },
  { id: "week", label: "Due this week", detail: (today) => `Through ${formatDate(windowEnd("week", today))}` },
  { id: "month", label: "Due this month", detail: (today) => `Through ${formatDate(windowEnd("month", today))}` },
];

function rankText(value: string, needle: string): number {
  const text = value.toLowerCase();
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  if (text.includes(needle)) return 2;
  return 3;
}

function matchesQuery(asset: { partNumber: string; type: string }, needle: string): boolean {
  return rankText(asset.partNumber, needle) < 3 || rankText(asset.type, needle) < 3;
}

function compareDue(a: AssetRow, b: AssetRow): number {
  if (!a.nextDueDate && !b.nextDueDate) return a.partNumber.localeCompare(b.partNumber);
  if (!a.nextDueDate) return 1;
  if (!b.nextDueDate) return -1;
  if (a.nextDueDate !== b.nextDueDate) return a.nextDueDate < b.nextDueDate ? -1 : 1;
  return a.partNumber.localeCompare(b.partNumber);
}

function DashboardPage() {
  const workspace = useWorkspace();
  const canWrite = workspace.member.role !== "viewer";
  const today = todayISO();
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<AttentionFilter>("all");

  useEffect(() => {
    let cancelled = false;
    listAssets()
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the register.");
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.company.id]);

  const counts = useMemo(() => attentionCounts(assets ?? [], today), [assets, today]);
  const active = chosen;
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!assets) return [];
    const rows = assets.filter(
      (asset) =>
        matchesAttention(asset, active, today) &&
        (!needle || matchesQuery(asset, needle)),
    );
    rows.sort((a, b) => {
      if (needle) {
        const rank =
          Math.min(rankText(a.partNumber, needle), rankText(a.type, needle)) -
          Math.min(rankText(b.partNumber, needle), rankText(b.type, needle));
        if (rank !== 0) return rank;
      }
      return compareDue(a, b);
    });
    return rows;
  }, [active, assets, needle, today]);

  const matchesAnywhere = useMemo(() => {
    if (!assets || !needle) return 0;
    return assets.filter((asset) => matchesQuery(asset, needle)).length;
  }, [assets, needle]);

  const matchesDue = useMemo(() => {
    if (!assets || !needle) return 0;
    return assets.filter(
      (asset) => matchesQuery(asset, needle) && matchesAttention(asset, "all", today),
    ).length;
  }, [assets, needle, today]);

  const activeLabel = ATTENTION_FILTERS.find((item) => item.id === active)?.label ?? "All";
  const caption =
    active === "overdue"
      ? "Due before today. Scrapped gear stays off this list."
      : active === "all"
        ? "Overdue, or due this week, month, quarter, or year. Later dates and assets with no date stay off this list."
        : `Due from today through ${formatDate(windowEnd(active, today))}. Scrapped gear stays off this list.`;

  return (
    <div className="grid items-start gap-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-pretty text-muted">
          What needs a test. Open a row to record the exam.
        </p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <section
        aria-label="Summary"
        className="grid w-full shrink-0 auto-rows-auto grid-cols-2 gap-px self-start overflow-visible rounded-sheet border border-line bg-line md:grid-cols-4"
      >
        {CARD_FILTERS.map((card, index) => {
          const value =
            card.id === "all"
              ? counts.assets
              : card.id === "overdue"
                ? counts.overdue
                : card.id === "week"
                  ? counts.week
                  : counts.month;
          const pressed = card.id !== "all" && chosen === card.id;
          const tone =
            card.id === "overdue" && value > 0
              ? "text-[#DC2626]"
              : card.id === "week" && value > 0
                ? "text-[#D97706]"
                : "text-ink";
          const className = cn(
            "h-auto min-h-[6.75rem] w-full min-w-0 bg-card px-4 py-4 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-60",
            index === 0 && "rounded-tl-sheet md:rounded-l-sheet",
            index === 1 && "rounded-tr-sheet md:rounded-none",
            index === 2 && "rounded-bl-sheet md:rounded-none",
            index === 3 && "rounded-br-sheet md:rounded-r-sheet",
            pressed && "bg-inset",
          );
          const body = (
            <>
              <p className="text-sm text-muted">{card.label}</p>
              <p className={cn("mt-1 font-display text-4xl tabular-nums tracking-tight", tone)}>
                {assets ? value : "—"}
              </p>
              <p className="text-xs text-pretty text-faint">{card.detail(today)}</p>
            </>
          );
          if (card.id === "all") {
            return (
              <Link key={card.id} to="/app/assets" className={className}>
                {body}
              </Link>
            );
          }
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={pressed}
              disabled={!assets}
              onClick={() => setChosen(card.id)}
              className={className}
            >
              {body}
            </button>
          );
        })}
      </section>
      <div className="grid gap-3">
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
              aria-label="Due window"
              value={active}
              disabled={!assets}
              className="w-full text-sm"
              onChange={(event) => {
                const next = event.target.value as AttentionFilter;
                if (ATTENTION_FILTERS.some((item) => item.id === next)) setChosen(next);
              }}
            >
              {ATTENTION_FILTERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted">{caption}</p>
      </div>
      {!assets ? (
        <div className="h-40 animate-pulse rounded-sheet bg-inset" />
      ) : visible.length === 0 ? (
        <div className="rounded-sheet border border-line bg-card p-4">
          <h2 className="font-display text-2xl tracking-tight">
            {assets.length === 0 ? "The book is empty." : needle ? "Nothing matches." : "Nothing in this window."}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {assets.length === 0
              ? canWrite
                ? "Add the first shackle, sling, or wire batch on the asset register."
                : "Nothing has been added for this company yet."
              : needle && matchesAnywhere > 0
                ? "That match is on the register, just not in this window."
                : needle
                  ? "Nothing matches. Try the full register if the mark is close."
                  : "Nothing is due in this window. The full register is on the Assets page."}
          </p>
          {assets.length === 0 && canWrite ? (
            <Link to="/app/assets" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
              Add an asset
            </Link>
          ) : null}
          {needle && matchesDue > 0 && active !== "all" ? (
            <button
              type="button"
              onClick={() => setChosen("all")}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              Show everything due
            </button>
          ) : null}
          {needle && matchesAnywhere > 0 && matchesDue === 0 ? (
            <Link to="/app/assets" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent">
              Open the asset register
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
          <div className="hidden border-b border-[#E5E7EB] bg-[#F8F9FB] px-4 py-2.5 text-xs font-medium text-[#6B7280] sm:grid sm:grid-cols-[minmax(8rem,1.2fr)_minmax(0,1.4fr)_8.5rem_auto] sm:items-center sm:gap-3">
            <span>Part number</span>
            <span>Title</span>
            <span>Next due</span>
            <span className="text-right">Status</span>
          </div>
          <ul aria-label={activeLabel}>
            {visible.map((asset, index) => (
              <AttentionRow key={asset.id} asset={asset} today={today} striped={index % 2 === 1} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AttentionRow({ asset, today, striped }: { asset: AssetRow; today: string; striped: boolean }) {
  return (
    <li className="border-b border-[#EEF1F4] last:border-b-0">
      <Link
        to="/app/assets/$assetId"
        params={{ assetId: asset.id }}
        className={cn(
          "grid grid-cols-1 gap-1 px-4 py-3.5 hover:bg-[#F4F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB] sm:min-h-14 sm:grid-cols-[minmax(8rem,1.2fr)_minmax(0,1.4fr)_8.5rem_auto] sm:items-center sm:gap-3 sm:py-0",
          striped && "bg-[#F8F9FB]",
        )}
      >
        <span className="flex items-start justify-between gap-3 sm:block">
          <span className="break-all font-mono text-[15px] font-semibold leading-5 text-[#111827]">
            {asset.partNumber}
          </span>
          <span className="sm:hidden">
            <AssetBadge status={asset.status} nextDue={asset.nextDueDate} today={today} />
          </span>
        </span>
        <span className="truncate text-sm text-[#6B7280]">{asset.type}</span>
        <span className="text-sm tabular-nums text-[#6B7280]">
          {asset.nextDueDate ? formatDate(asset.nextDueDate) : "No due date"}
        </span>
        <span className="hidden justify-self-end sm:block">
          <AssetBadge status={asset.status} nextDue={asset.nextDueDate} today={today} />
        </span>
      </Link>
    </li>
  );
}
