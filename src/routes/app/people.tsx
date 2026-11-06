import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/lift/format";
import { inviteUrl } from "@/lib/lift/invite-link";
import { createInvite, listPeople, revokeInvite, setMemberRole } from "@/lib/lift/server";
import { ROLE_LABEL, ROLES, type People, type Role } from "@/lib/lift/types";
import { useWorkspace } from "@/lib/lift/workspace";

export const Route = createFileRoute("/app/people")({
  component: PeoplePage,
});

type InviteResult = {
  email: string;
  role: Role;
  updated: boolean;
  token: string;
  emailed: boolean;
  emailError: string | null;
};

function PeoplePage() {
  const workspace = useWorkspace();
  const isAdmin = workspace.member.role === "admin";
  const [people, setPeople] = useState<People | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("inspector");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reload() {
    return listPeople()
      .then(setPeople)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load people.");
      });
  }

  useEffect(() => {
    if (!isAdmin) return;
    void reload();
  }, [isAdmin, workspace.company.id]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setResult(null);
    try {
      const next = await createInvite({ data: { email, role } });
      setEmail("");
      setResult(next);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add that user.");
    } finally {
      setPending(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg">
        <h1 className="font-display text-4xl tracking-tight">Add user</h1>
        <p className="mt-3 text-muted">Only an admin can invite people.</p>
      </div>
    );
  }

  return (
    <div className="grid max-w-3xl gap-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Add user</h1>
        <p className="mt-2 max-w-xl text-pretty text-muted">
          Invite an email into {workspace.company.name}. They get a link by email, and they join when they create an
          account or sign in with that exact address. If the email does not go out, copy the link and send it yourself.
        </p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <form onSubmit={onInvite} className="grid gap-4 rounded-sheet border border-line bg-card p-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="off"
            placeholder="inspector@yard.test"
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Role">
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-muted">
          Viewers can read. Inspectors can change gear and record exams. Admins can also invite people and import
          assets.
        </p>
        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add user"}
        </Button>
      </form>
      {result ? <InviteOutcome result={result} /> : null}
      {!people ? (
        <div className="h-32 animate-pulse rounded-sheet bg-inset" />
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl tracking-tight">Pending invites</h2>
            {people.invites.length === 0 ? (
              <p className="text-sm text-muted">No one is waiting.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-sheet border border-line bg-card">
                {people.invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm">{invite.email}</p>
                      <p className="text-sm text-muted">
                        {ROLE_LABEL[invite.role]} · {formatDate(invite.createdOn)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invite.token ? <CopyLinkButton token={invite.token} /> : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setError(null);
                          void revokeInvite({ data: { id: invite.id } })
                            .then(() => reload())
                            .catch((err: unknown) => {
                              setError(err instanceof Error ? err.message : "Could not revoke that invite.");
                            });
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl tracking-tight">In the company</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-sheet border border-line bg-card">
              {people.members.map((person) => (
                <li key={person.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    <p className="break-all text-sm text-muted">{person.email}</p>
                  </div>
                  {person.self ? (
                    <p className="text-sm text-muted">{ROLE_LABEL[person.role]} · You</p>
                  ) : (
                    <Select
                      aria-label={`Role for ${person.email}`}
                      value={person.role}
                      className="sm:w-40"
                      onChange={(event) => {
                        const next = event.target.value as Role;
                        setError(null);
                        void setMemberRole({ data: { userId: person.id, role: next } })
                          .then(() => reload())
                          .catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : "Could not change that role.");
                          });
                      }}
                    >
                      {ROLES.map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function InviteOutcome({ result }: { result: InviteResult }) {
  return (
    <div className="grid gap-3 rounded-sheet border border-line bg-card p-4">
      {result.emailed ? (
        <p className="text-sm font-medium text-accent">Invite sent to {result.email}.</p>
      ) : (
        <p className="text-sm text-danger">{result.emailError ?? "The email was not sent."}</p>
      )}
      {result.updated ? (
        <p className="text-sm text-muted">The pending role is now {ROLE_LABEL[result.role]}.</p>
      ) : null}
      <InviteLinkField token={result.token} />
    </div>
  );
}

function InviteLinkField({ token }: { token: string }) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    setLink(inviteUrl(token));
  }, [token]);

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">Invite link</p>
      <div className="flex flex-wrap gap-2">
        <Input
          readOnly
          value={link}
          aria-label="Invite link"
          className="min-w-0 flex-1 font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCopyError(null);
            void navigator.clipboard.writeText(link).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              },
              () => setCopyError("Could not copy. Select the link and copy it."),
            );
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {copyError ? <p className="text-sm text-danger">{copyError}</p> : null}
    </div>
  );
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(inviteUrl(token)).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
