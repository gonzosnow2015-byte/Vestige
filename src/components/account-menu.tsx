import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ROLE_LABEL } from "@/lib/lift/types";
import { useRequestSwitch, useWorkspace } from "@/lib/lift/workspace";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const workspace = useWorkspace();
  const requestSwitch = useRequestSwitch();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isAdmin = workspace.member.role === "admin";
  const label = user?.displayName?.trim() || "Account";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md text-[#1A1D23]",
          open ? "bg-[#F3F4F6]" : "hover:bg-[#F3F4F6]",
        )}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-12 left-0 z-20 w-64 rounded-md border border-[#E5E7EB] bg-white py-1 shadow-sm"
        >
          <div className="border-b border-[#E5E7EB] px-3 py-2">
            <p className="text-sm font-medium text-[#1A1D23]">{label}</p>
            <p className="mt-0.5 text-sm break-all text-[#6B7280]">
              {ROLE_LABEL[workspace.member.role]} • {workspace.member.email}
            </p>
          </div>
          <MenuLink to="/app" onPick={() => setOpen(false)}>
            Dashboard
          </MenuLink>
          <MenuLink to="/app/assets" onPick={() => setOpen(false)}>
            Assets
          </MenuLink>
          {isAdmin ? (
            <MenuLink to="/app/people" onPick={() => setOpen(false)}>
              Add user
            </MenuLink>
          ) : null}
          <MenuLink to="/app/account" onPick={() => setOpen(false)}>
            Account
          </MenuLink>
          {workspace.companies.length > 1 ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                requestSwitch();
              }}
              className="flex min-h-11 w-full items-center px-3 text-left text-sm text-[#1A1D23] hover:bg-[#F8F9FB]"
            >
              Switch company
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut().catch(() => setSigningOut(false));
            }}
            className="flex min-h-11 w-full items-center px-3 text-left text-sm text-[#1A1D23] hover:bg-[#F8F9FB] disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  to,
  onPick,
  children,
}: {
  to: "/app" | "/app/assets" | "/app/account" | "/app/people";
  onPick: () => void;
  children: string;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onPick}
      className="flex min-h-11 items-center px-3 text-sm text-[#1A1D23] hover:bg-[#F8F9FB]"
    >
      {children}
    </Link>
  );
}
