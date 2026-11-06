import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CompanyPicker } from "@/components/company-picker";
import { CompanyNameStep } from "@/components/auth-screen";
import { Shell } from "@/components/shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { forgetCompany, rememberCompany, rememberedCompany } from "@/lib/lift/active-company";
import { rememberInviteToken, clearInviteToken } from "@/lib/lift/invite-link";
import { enterApp, selectCompany } from "@/lib/lift/server";
import type { CompanyChoice, Workspace } from "@/lib/lift/types";
import { WorkspaceProvider } from "@/lib/lift/workspace";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setError(null);
    setPickError(null);
    setWorkspace(undefined);
    setChoosing(false);
    const token = rememberInviteToken();
    enterApp({
      data: {
        token: token || undefined,
        companyId: token ? undefined : rememberedCompany() || undefined,
      },
    })
      .then((entry) => {
        if (cancelled) return;
        clearInviteToken();
        setCompanies(entry.companies);
        if (entry.workspace) {
          rememberCompany(entry.workspace.company.id);
          setWorkspace(entry.workspace);
          return;
        }
        forgetCompany();
        setWorkspace(null);
        setChoosing(entry.companies.length > 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the company.");
        setWorkspace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function pick(companyId: string) {
    const previous = rememberedCompany();
    setPendingId(companyId);
    setPickError(null);
    rememberCompany(companyId);
    try {
      const next = await selectCompany({ data: { companyId } });
      await navigate({ to: "/app", replace: true });
      setCompanies(next.companies);
      setWorkspace(next);
      setChoosing(false);
    } catch (err) {
      if (previous) rememberCompany(previous);
      else forgetCompany();
      setPickError(err instanceof Error ? err.message : "Could not open that company.");
    } finally {
      setPendingId(null);
    }
  }

  if (isPending || (user && workspace === undefined && !error)) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-10 w-40 animate-pulse rounded-control bg-inset" />
        <div className="mt-6 h-40 animate-pulse rounded-sheet bg-inset" />
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-3xl tracking-tight">The register did not load.</h1>
        <p className="mt-3 text-sm text-danger">{error}</p>
      </main>
    );
  }
  if (choosing && companies.length > 1) {
    return <CompanyPicker companies={companies} pendingId={pendingId} error={pickError} onSelect={(id) => void pick(id)} />;
  }
  if (!workspace) {
    return (
      <CompanyNameStep
        skipLookup
        onCreated={(next) => {
          rememberCompany(next.company.id);
          setCompanies(next.companies);
          setWorkspace(next);
          setChoosing(false);
        }}
      />
    );
  }
  return (
    <WorkspaceProvider workspace={workspace} setWorkspace={setWorkspace} requestSwitch={() => setChoosing(true)}>
      <Shell key={workspace.company.id}>
        <Outlet />
      </Shell>
    </WorkspaceProvider>
  );
}