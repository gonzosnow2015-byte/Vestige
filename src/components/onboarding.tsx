import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { rememberInviteToken } from "@/lib/lift/invite-link";
import { getJoinHint, lookupInvite } from "@/lib/lift/server";

export function Onboarding() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = rememberInviteToken();
    Promise.all([getJoinHint(), token ? lookupInvite({ data: { token } }) : Promise.resolve(null)])
      .then(([value, invite]) => {
        if (cancelled) return;
        setEmail(value.email);
        if (!token) return;
        if (!invite) {
          setInviteNote("That invite link is no longer valid.");
          return;
        }
        if (invite.email.toLowerCase() !== value.email.toLowerCase()) {
          setInviteNote(
            `This invite is for ${invite.email}. You are signed in as ${value.email}. Sign out and use the invited address.`,
          );
          return;
        }
        setInviteNote(
          `The invite for ${invite.companyName} is still open, but this sign-in did not join it. Sign out and open the link again.`,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not check this account.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="font-display text-3xl tracking-tight">Vestige</p>
      <h1 className="mt-8 font-display text-4xl tracking-tight">No company on this sign-in.</h1>
      <p className="mt-3 text-pretty text-muted">
        {email ? `${email} is not linked to a register. ` : null}
        Sign in only opens an existing company. Use Create account, then Google or X, and enter the company name.
        Or ask an admin to invite this email.
      </p>
      {inviteNote ? <p className="mt-3 text-sm text-danger">{inviteNote}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void signOut().catch(() => undefined);
          }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
