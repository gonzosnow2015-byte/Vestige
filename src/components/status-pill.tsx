import { readiness } from "@/lib/lift/format";
import { RESULT_LABEL, type AssetStatus, type InspectionResult } from "@/lib/lift/types";
import { cn } from "@/lib/utils";

type BadgeKind = "in_service" | "due_soon" | "overdue" | "quarantine" | "out_of_service" | "scrapped";

const BADGE: Record<BadgeKind, { label: string; className: string }> = {
  in_service: {
    label: "In Service",
    className: "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]",
  },
  due_soon: {
    label: "Due Soon",
    className: "border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]",
  },
  overdue: {
    label: "Overdue",
    className: "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]",
  },
  quarantine: {
    label: "Quarantine",
    className: "border-[#FDBA74] bg-[#FFF7ED] text-[#EA580C]",
  },
  out_of_service: {
    label: "Out of Service",
    className: "border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]",
  },
  scrapped: {
    label: "Scrapped",
    className: "border-[#D1D5DB] bg-[#F3F4F6] text-[#374151]",
  },
};

function badgeKind(status: AssetStatus, nextDue: string | null, today?: string): BadgeKind {
  if (status === "quarantine" || status === "out_of_service" || status === "scrapped") return status;
  const kind = readiness(status, nextDue, today);
  if (kind === "due_soon" || kind === "overdue") return kind;
  return "in_service";
}

function Badge({ kind }: { kind: BadgeKind }) {
  const spec = BADGE[kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold leading-5",
        spec.className,
      )}
    >
      {spec.label}
    </span>
  );
}

/** One badge: tagged-out status wins, otherwise the due-date state. */
export function AssetBadge({
  status,
  nextDue,
  today,
}: {
  status: AssetStatus;
  nextDue: string | null;
  today?: string;
}) {
  return <Badge kind={badgeKind(status, nextDue, today)} />;
}

const RESULT_CLASS: Record<InspectionResult, string> = {
  pass: "text-[#059669]",
  fail: "text-[#DC2626]",
  conditional: "text-[#D97706]",
};

export function ResultText({ result }: { result: InspectionResult }) {
  return <span className={cn("font-medium", RESULT_CLASS[result])}>{RESULT_LABEL[result]}</span>;
}
