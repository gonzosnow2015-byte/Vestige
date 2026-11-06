import { Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useSyncExternalStore, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { authClient, GROK_PROVIDERS, signIn, signOut } from "@/lib/auth/client";
import {
  beginAccountSetup,
  clearCreateIntent,
  endAccountSetup,
  hasCreateIntent,
  isAccountSetup,
  markCreateIntent,
  subscribeAccountSetup,
} from "@/lib/auth/create-intent";
import { clearExplicitSignOut, hasExplicitSignOut } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { clearInviteToken, inviteTokenFromUrl, rememberInviteToken } from "@/lib/lift/invite-link";
import { enterApp, createCompany, lookupInvite } from "@/lib/lift/server";
import { rememberedCompany, forgetCompany, rememberCompany } from "@/lib/lift/active-company";
import { ROLE_LABEL, type InvitePreview, type Workspace } from "@/lib/lift/types";

const FONT = '"Inter", ui-sans-serif, system-ui, sans-serif';
const subscribeToNothing = () => () => {};

export function AuthPage() {
  const { user, isPending } = useCurrentUserState();
  // Read on the first client render. A session that reappears after Sign out
  // must not skip this page — the hold is set before the redirect.
  const stayingOut = useSyncExternalStore(subscribeToNothing, hasExplicitSignOut, () => false);
  const creating = useSyncExternalStore(subscribeToNothing, hasCreateIntent, () => false);
  const settingUp = useSyncExternalStore(subscribeAccountSetup, isAccountSetup, () => false);
  if (typeof window !== "undefined") rememberInviteToken();
  if (!settingUp && isPending && !stayingOut) {
    return (
      <AuthShell>
        <div className="mx-auto h-10 w-36 animate-pulse rounded-lg bg-[#E5E7EB]" />
      </AuthShell>
    );
  }
  if (!settingUp && user && !stayingOut && creating) return <CompanyNameStep />;
  if (!settingUp && user && !stayingOut) return <Navigate to="/app" />;
  return <AuthForm />;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-[#F8F9FB] px-4 py-10 text-[#1A1D23]"
      style={{ fontFamily: FONT }}
    >
      <div className="w-full max-w-[400px]">{children}</div>
    </main>
  );
}

type Flow = "sign-in" | "create-company" | "accept-invite";

function AuthForm() {
  const navigate = useNavigate();
  const [flow, setFlow] = useState<Flow>("sign-in");
  const flowChosen = useRef(false);
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteReady, setInviteReady] = useState(false);

  useEffect(() => {
    const fromUrl = inviteTokenFromUrl();
    if (!fromUrl) {
      setInviteReady(true);
      return;
    }
    rememberInviteToken();
    let cancelled = false;
    lookupInvite({ data: { token: fromUrl } })
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          clearInviteToken();
          setError("That invite link is not valid.");
          return;
        }
        setInvite(row);
        if (!flowChosen.current) {
          setEmail(row.email);
          setFlow("accept-invite");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not open that invite.");
      })
      .finally(() => {
        if (!cancelled) setInviteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseFlow(next: Flow) {
    flowChosen.current = true;
    setFlow(next);
    setError(null);
    if (next === "accept-invite" && invite) setEmail(invite.email);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (flow === "create-company" && companyName.trim().length < 2) {
      setError("Enter the company name.");
      return;
    }
    if (flow !== "sign-in" && name.trim().length < 1) {
      setError("Enter your name.");
      return;
    }
    setPending(true);
    const creatingAccount = flow !== "sign-in";
    if (creatingAccount) beginAccountSetup();
    try {
      if (flow === "create-company" || flow === "accept-invite") {
        const signedUp = await authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: "/app",
        });
        if (signedUp.error) {
          throw new Error(signedUp.error.message ?? "Could not create the account.");
        }
        clearExplicitSignOut();
        forgetCompany();
        await authClient.getSession();
        const workspace = await createCompany({
          data: { name: flow === "create-company" ? companyName.trim() : "" },
        });
        rememberCompany(workspace.company.id);
        clearInviteToken();
        clearCreateIntent();
      } else {
        const signedIn = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/app",
        });
        if (signedIn.error) {
          throw new Error(signedIn.error.message ?? "Could not sign in.");
        }
        clearExplicitSignOut();
        forgetCompany();
      }
      if (creatingAccount) endAccountSetup();
      await navigate({ to: "/app" });
    } catch (err) {
      if (creatingAccount) endAccountSetup();
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  const acceptInvite = flow === "accept-invite" && invite;
  const creatingCompany = flow === "create-company";

  return (
    <AuthShell>
      <h1
        className="text-center text-[38px] font-bold leading-none tracking-[-0.025em] text-[#1A1D23]"
        style={{ fontFamily: FONT }}
      >
        Vestige
      </h1>
      <p className="mt-2.5 text-center text-[15px] font-normal leading-snug text-[#6B7280]">
        Every asset. Full history.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-8 grid gap-4 rounded-xl border border-[#E6E8EC] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_rgba(17,24,39,0.06)]"
      >
        {acceptInvite ? (
          <p className="text-sm text-[#6B7280]">
            {invite.companyName} invited you as {ROLE_LABEL[invite.role]}. Use {invite.email}. This joins that
            company. It does not start a new one.
          </p>
        ) : null}
        {creatingCompany ? (
          <>
            <div>
              <h2 className="text-base font-semibold text-[#1A1D23]">New company</h2>
              <p className="mt-1 text-sm text-[#6B7280]">
                This opens a new register and makes you the admin. It is separate from accepting an invite.
              </p>
            </div>
            <AuthField label="Company" hint="Required.">
              <AuthInput
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="organization"
                placeholder="North Yard Rigging"
              />
            </AuthField>
            <AuthField label="Your name">
              <AuthInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </AuthField>
          </>
        ) : null}
        {acceptInvite ? (
          <AuthField label="Your name">
            <AuthInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
            />
          </AuthField>
        ) : null}
        {flow === "sign-in" && invite ? (
          <p className="text-sm text-[#6B7280]">
            {invite.companyName} invited {invite.email} as {ROLE_LABEL[invite.role]}.{" "}
            <button
              type="button"
              onClick={() => chooseFlow("accept-invite")}
              className="font-medium text-[#2563EB] hover:underline"
            >
              Accept invite
            </button>
          </p>
        ) : null}
        <AuthField label="Email">
          <AuthInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            readOnly={Boolean(acceptInvite)}
            autoComplete="email"
          />
        </AuthField>
        <AuthField label="Password" hint={flow === "sign-in" ? undefined : "At least 8 characters."}>
          <AuthInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={flow === "sign-in" ? "current-password" : "new-password"}
          />
        </AuthField>
        {error ? <p className="text-sm text-[#B42318]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending || !inviteReady}
          className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50"
        >
          {pending ? "Working…" : acceptInvite ? "Accept invite" : creatingCompany ? "Create account" : "Sign in"}
        </button>
        {flow === "sign-in" ? (
          <button
            type="button"
            onClick={() => chooseFlow("create-company")}
            className="text-[15px] font-medium text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Create account
          </button>
        ) : (
          <button
            type="button"
            onClick={() => chooseFlow("sign-in")}
            className="text-[15px] font-medium text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Sign in
          </button>
        )}
        {acceptInvite ? (
          <button
            type="button"
            onClick={() => chooseFlow("create-company")}
            className="text-[15px] font-medium text-[#6B7280] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Create a new company instead
          </button>
        ) : null}
        {creatingCompany && invite ? (
          <button
            type="button"
            onClick={() => chooseFlow("accept-invite")}
            className="text-[15px] font-medium text-[#6B7280] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Accept the invite instead
          </button>
        ) : null}
        <div className="grid gap-2 border-t border-[#E6E8EC] pt-4">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              disabled={!inviteReady}
              onClick={() => {
                if (creatingCompany) markCreateIntent();
                else clearCreateIntent();
                const callbackURL = creatingCompany ? "/?create=company" : "/app";
                void signIn(provider.providerId, { callbackURL }).catch((err: unknown) => {
                  if (creatingCompany) clearCreateIntent();
                  setError(err instanceof Error ? err.message : "Could not start sign-in.");
                });
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#D1D5DB] bg-white px-4 text-sm font-medium text-[#1A1D23] transition-colors hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50"
            >
              Sign in with {provider.label}
            </button>
          ))}
        </div>
      </form>
    </AuthShell>
  );
}

export function CompanyNameStep({
  onCreated,
  skipLookup = false,
}: {
  onCreated?: (workspace: Workspace) => void;
  /** Parent already knows this account has no company. */
  skipLookup?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [checking, setChecking] = useState(!skipLookup);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    if (skipLookup) return;
    let cancelled = false;
    enterApp({
      data: {
        join: false,
        companyId: rememberedCompany() || undefined,
      },
    })
      .then((entry) => {
        if (cancelled) return;
        if (entry.workspace || entry.companies.length > 0) {
          clearCreateIntent();
          if (entry.workspace) {
            rememberCompany(entry.workspace.company.id);
            const created = onCreatedRef.current;
            if (created) created(entry.workspace);
            else void navigate({ to: "/app" });
            return;
          }
          void navigate({ to: "/app" });
          return;
        }
        setChecking(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not check this account.");
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, skipLookup]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = companyName.trim();
    if (name.length < 2) {
      setError("Enter the company name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const workspace = await createCompany({ data: { name } });
      clearCreateIntent();
      clearInviteToken();
      rememberCompany(workspace.company.id);
      const created = onCreatedRef.current;
      if (created) created(workspace);
      else await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the company.");
      setPending(false);
    }
  }

  const email = user?.primaryEmail;

  return (
    <AuthShell>
      <h1
        className="text-center text-[38px] font-bold leading-none tracking-[-0.025em] text-[#1A1D23]"
        style={{ fontFamily: FONT }}
      >
        Vestige
      </h1>
      <p className="mt-2.5 text-center text-[15px] font-normal leading-snug text-[#6B7280]">
        Every asset. Full history.
      </p>
      {checking ? (
        <div className="mx-auto mt-8 h-40 w-full animate-pulse rounded-xl bg-[#E5E7EB]" />
      ) : (
        <form
          onSubmit={onSubmit}
          className="mt-8 grid gap-4 rounded-xl border border-[#E6E8EC] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_rgba(17,24,39,0.06)]"
        >
          <div>
            <h2 className="text-base font-semibold text-[#1A1D23]">Name the company</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              {email
                ? `${user?.displayName ? `${user.displayName} · ` : ""}${email} is not in a company yet. This opens a new register and makes you the admin.`
                : "This account is not in a company yet. Name one to open a new register."}
            </p>
          </div>
          <AuthField label="Company" hint="Required. This opens a new register.">
            <AuthInput
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
              minLength={2}
              maxLength={80}
              autoComplete="organization"
              placeholder="North Yard Rigging"
            />
          </AuthField>
          {error ? <p className="text-sm text-[#B42318]">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create company"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearCreateIntent();
              void signOut("/").catch(() => undefined);
            }}
            className="text-[15px] font-medium text-[#6B7280] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Cancel
          </button>
        </form>
      )}
    </AuthShell>
  );
}

function AuthField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-[#1A1D23]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[#6B7280]">{hint}</span> : null}
    </label>
  );
}

function AuthInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className="h-11 rounded-lg border-[#E6E8EC] bg-white text-base text-[#1A1D23] placeholder:text-[#9CA3AF] focus-visible:ring-[#2563EB] focus-visible:ring-offset-0"
    />
  );
}
