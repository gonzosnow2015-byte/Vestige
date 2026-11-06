import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { useWorkspace } from "@/lib/lift/workspace";

export function Shell({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 md:px-6">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-start border-b border-line pb-5">
        <AccountMenu />
        <div className="min-w-0 px-2 text-center">
          <Link
            to="/app"
            className="font-display text-3xl tracking-tight text-[#1A1D23] underline-offset-[0.14em]"
          >
            <span className="underline decoration-1 decoration-current">Vesti</span>
            <span>g</span>
            <span className="underline decoration-1 decoration-current">e</span>
          </Link>
          <p className="mt-1 text-[15px] text-[#6B7280]">Every asset. Full history.</p>
          <p className="mt-4 text-2xl tracking-tight text-[#1A1D23]">{workspace.company.name}</p>
        </div>
      </header>
      <main className="rise flex-1 py-6">{children}</main>
    </div>
  );
}
