import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, signOut } from "@/lib/auth/client";
import { markExplicitSignOut } from "@/lib/auth/gate-session-marker";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { deleteAccount, getAccountAccess, renameCompany } from "@/lib/lift/server";
import { useSetWorkspace, useWorkspace } from "@/lib/lift/workspace";

export const Route = createFileRoute("/app/account")({
  component: AccountPage,
});

function AccountPage() {
  const user = useCurrentUser();
  const workspace = useWorkspace();
  const setWorkspace = useSetWorkspace();
  const isAdmin = workspace.member.role === "admin";
  const [access, setAccess] = useState<{ email: string; hasPassword: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(user?.displayName ?? "");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [namePending, setNamePending] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordPending, setPasswordPending] = useState(false);
  const [companyName, setCompanyName] = useState(workspace.company.name);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companyPending, setCompanyPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAccountAccess()
      .then((value) => {
        if (!cancelled) setAccess(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the account.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onName(event: FormEvent) {
    event.preventDefault();
    setNamePending(true);
    setNameError(null);
    setNameMessage(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setNamePending(false);
    if (result.error) {
      setNameError(result.error.message ?? "Could not save the name.");
      return;
    }
    setNameMessage("Name saved.");
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (nextPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordError("Those passwords do not match.");
      return;
    }
    setPasswordPending(true);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword: nextPassword,
      revokeOtherSessions: false,
    });
    setPasswordPending(false);
    if (result.error) {
      setPasswordError(result.error.message ?? "Could not change the password.");
      return;
    }
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password changed.");
  }

  async function onCompany(event: FormEvent) {
    event.preventDefault();
    setCompanyPending(true);
    setCompanyMessage(null);
    setCompanyError(null);
    try {
      const next = await renameCompany({ data: { name: companyName } });
      setWorkspace(next);
      setCompanyName(next.company.name);
      setCompanyMessage("Company name saved.");
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : "Could not rename the company.");
    } finally {
      setCompanyPending(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount({ data: {} });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the account.");
      setDeleting(false);
      return;
    }
    try {
      await signOut("/");
    } catch {
      markExplicitSignOut();
      window.location.href = "/";
    }
  }

  return (
    <div className="grid max-w-lg gap-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Account</h1>
        <p className="mt-2 text-muted">{access ? access.email : "Your sign-in."}</p>
      </div>
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}
      <form onSubmit={onName} className="grid gap-4 rounded-sheet border border-line bg-card p-4">
        <h2 className="font-display text-2xl tracking-tight">Display name</h2>
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            autoComplete="name"
          />
        </Field>
        {nameError ? <p className="text-sm text-danger">{nameError}</p> : null}
        {nameMessage ? <p className="text-sm text-muted">{nameMessage}</p> : null}
        <Button type="submit" disabled={namePending}>
          {namePending ? "Saving…" : "Save name"}
        </Button>
      </form>
      {access && !access.hasPassword ? (
        <p className="text-sm text-muted">
          This account signs in with Google or X, so there is no password to change.
        </p>
      ) : (
        <form onSubmit={onPassword} className="grid gap-4 rounded-sheet border border-line bg-card p-4">
          <h2 className="font-display text-2xl tracking-tight">Password</h2>
          <Field label="Current password">
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
          {passwordMessage ? <p className="text-sm text-muted">{passwordMessage}</p> : null}
          <Button type="submit" disabled={passwordPending || !access}>
            {passwordPending ? "Saving…" : "Change password"}
          </Button>
        </form>
      )}
      {isAdmin ? (
        <form onSubmit={onCompany} className="grid gap-4 rounded-sheet border border-line bg-card p-4">
          <h2 className="font-display text-2xl tracking-tight">Company name</h2>
          <Field label="Name">
            <Input
              value={companyName}
              onChange={(event) => {
                setCompanyName(event.target.value);
                setCompanyMessage(null);
              }}
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          {companyError ? <p className="text-sm text-danger">{companyError}</p> : null}
          {companyMessage ? <p className="text-sm text-muted">{companyMessage}</p> : null}
          <Button
            type="submit"
            disabled={companyPending || companyName.trim() === workspace.company.name}
          >
            {companyPending ? "Saving…" : "Rename company"}
          </Button>
        </form>
      ) : null}
      <section className="grid gap-3 border-t border-[#E5E7EB] pt-8">
        <h2 className="font-display text-2xl tracking-tight">Delete account</h2>
        <p className="text-sm text-muted">
          Removes your sign-in and membership. If you are the only person in the company, the register goes with it.
        </p>
        {confirmDelete ? (
          <div className="grid gap-3">
            <p className="text-sm text-[#1A1D23]">Are you sure? This cannot be undone.</p>
            {deleteError ? <p className="text-sm text-danger">{deleteError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void onDelete()}>
                {deleting ? "Deleting…" : "Delete account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
