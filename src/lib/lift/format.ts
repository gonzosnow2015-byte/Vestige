import type { AssetStatus, InspectionResult } from "@/lib/lift/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseISODate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  const monthIndex = Number(month) - 1;
  if (!year || !day || monthIndex < 0 || monthIndex > 11) return iso;
  return `${Number(day)} ${MONTHS[monthIndex]} ${year}`;
}

export function addDaysISO(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Calendar months from a due date, clamped to the last day of the target month. */
export function addMonthsISO(iso: string, months: number): string {
  const date = parseISODate(iso);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toISODate(target);
}

/** Sunday that ends the calendar week containing `iso`. */
export function endOfWeekISO(iso: string): string {
  const day = parseISODate(iso).getDay();
  return addDaysISO(iso, day === 0 ? 0 : 7 - day);
}

export function endOfMonthISO(iso: string): string {
  const date = parseISODate(iso);
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function endOfQuarterISO(iso: string): string {
  const date = parseISODate(iso);
  const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  return toISODate(new Date(date.getFullYear(), quarterEndMonth + 1, 0));
}

export function endOfYearISO(iso: string): string {
  return `${parseISODate(iso).getFullYear()}-12-31`;
}

export const ATTENTION_FILTERS = [
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "Due this week" },
  { id: "month", label: "Due this month" },
  { id: "quarter", label: "Due this quarter" },
  { id: "year", label: "Due this year" },
  { id: "all", label: "All" },
] as const;

export type AttentionFilter = (typeof ATTENTION_FILTERS)[number]["id"];

export function windowEnd(filter: Exclude<AttentionFilter, "overdue" | "all">, today: string): string {
  if (filter === "week") return endOfWeekISO(today);
  if (filter === "month") return endOfMonthISO(today);
  if (filter === "quarter") return endOfQuarterISO(today);
  return endOfYearISO(today);
}

type Dated = { status: string; nextDueDate: string | null };

/** Scrapped gear and undated gear stay off every list. All is the union of the due windows: overdue, or due this week, month, quarter, or year. */
export function matchesAttention(asset: Dated, filter: AttentionFilter, today: string): boolean {
  if (asset.status === "scrapped" || !asset.nextDueDate) return false;
  if (filter === "all") {
    if (asset.nextDueDate < today) return true;
    const latest = windowEnd("week", today) > windowEnd("year", today) ? windowEnd("week", today) : windowEnd("year", today);
    return asset.nextDueDate <= latest;
  }
  if (filter === "overdue") return asset.nextDueDate < today;
  return asset.nextDueDate >= today && asset.nextDueDate <= windowEnd(filter, today);
}

export type AttentionCounts = {
  assets: number;
  overdue: number;
  week: number;
  month: number;
  quarter: number;
  year: number;
};

export function attentionCounts<T extends Dated>(assets: T[], today: string): AttentionCounts {
  const ends = {
    week: endOfWeekISO(today),
    month: endOfMonthISO(today),
    quarter: endOfQuarterISO(today),
    year: endOfYearISO(today),
  };
  const tally: AttentionCounts = {
    assets: assets.length,
    overdue: 0,
    week: 0,
    month: 0,
    quarter: 0,
    year: 0,
  };
  for (const asset of assets) {
    if (asset.status === "scrapped" || !asset.nextDueDate) continue;
    const due = asset.nextDueDate;
    if (due < today) {
      tally.overdue += 1;
      continue;
    }
    if (due <= ends.week) tally.week += 1;
    if (due <= ends.month) tally.month += 1;
    if (due <= ends.quarter) tally.quarter += 1;
    if (due <= ends.year) tally.year += 1;
  }
  return tally;
}

export function defaultAttention(counts: Pick<AttentionCounts, "overdue" | "week" | "month">): AttentionFilter {
  if (counts.overdue > 0) return "overdue";
  if (counts.week > 0) return "week";
  if (counts.month > 0) return "month";
  return "all";
}

/**
 * Fail holds in-service gear in quarantine (out of service and scrapped stay as they are).
 * Pass brings quarantined or out-of-service gear back in service.
 */
export function suggestStatus(result: InspectionResult, current: AssetStatus): AssetStatus {
  if (result === "fail") {
    if (current === "out_of_service" || current === "scrapped") return current;
    return "quarantine";
  }
  if (result === "pass") {
    if (current === "quarantine" || current === "out_of_service") return "in_service";
    return current;
  }
  return current;
}

export type DueTone = "overdue" | "soon" | "ok" | "none";

export function dueTone(
  nextDue: string | null,
  status: string,
  today = todayISO(),
): DueTone {
  if (!nextDue || status === "scrapped") return "none";
  if (nextDue < today) return "overdue";
  if (nextDue <= addDaysISO(today, 30)) return "soon";
  return "ok";
}

export type Readiness = "in_service" | "due_soon" | "overdue" | "out_of_service";

export const READINESS_LABEL: Record<Readiness, string> = {
  in_service: "In Service",
  due_soon: "Due Soon",
  overdue: "Overdue",
  out_of_service: "Out of Service",
};

/** One badge per asset. Tagged-out gear wins over a due date. */
export function readiness(status: string, nextDue: string | null, today = todayISO()): Readiness {
  if (status === "out_of_service" || status === "quarantine" || status === "scrapped") {
    return "out_of_service";
  }
  const tone = dueTone(nextDue, status, today);
  if (tone === "overdue") return "overdue";
  if (tone === "soon") return "due_soon";
  return "in_service";
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  const mb = size / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
