import { ROLE_LABEL, type CompanyChoice } from "@/lib/lift/types";

export function CompanyPicker({
  companies,
  pendingId,
  error,
  onSelect,
}: {
  companies: CompanyChoice[];
  pendingId: string | null;
  error: string | null;
  onSelect: (companyId: string) => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="font-display text-3xl tracking-tight">Vestige</p>
      <h1 className="mt-8 font-display text-4xl tracking-tight">Which company?</h1>
      <p className="mt-3 text-pretty text-muted">Choose the register to open. You only see that company’s assets.</p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-6 grid gap-2">
        {companies.map((company) => (
          <li key={company.id}>
            <button
              type="button"
              disabled={pendingId !== null}
              onClick={() => onSelect(company.id)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-sheet border border-line bg-card px-4 text-left hover:bg-inset disabled:opacity-60"
            >
              <span className="text-lg tracking-tight">
                {pendingId === company.id ? "Opening…" : company.name}
              </span>
              <span className="shrink-0 text-sm text-muted">{ROLE_LABEL[company.role]}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}