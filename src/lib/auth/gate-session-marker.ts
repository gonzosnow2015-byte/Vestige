/**
 * Client-readable marker for gate-materialized sessions ("Sign in with Grok"
 * zero-click sessions minted by `gate-session.server.ts`).
 *
 * An explicit sign-out must survive the next `/get-session`. The preview sends
 * `x-grok-identity` on every request, and that hook would otherwise mint a new
 * session immediately — the sign-in page flashes, then the visitor is back in.
 * The signed-out cookie and header tell that hook to stay out until the
 * visitor signs in again.
 *
 * `__Host-` prefixed like the other auth cookies: browsers reject a `__Host-`
 * cookie carrying a `Domain`, so an untrusted sibling `*.grok.me` app cannot
 * plant a parent-domain copy that the host-only clear could never expire.
 * Client-safe: no server imports.
 */
export const GATE_SESSION_MARKER_COOKIE = "__Host-grok_gate_session";

/** Set on an explicit sign-out. Not HttpOnly — the client clears it on sign-in. */
export const EXPLICIT_SIGN_OUT_COOKIE = "__Host-lifttrack.signed_out";

/** Same signal on the request, for the tab that just signed out. */
export const EXPLICIT_SIGN_OUT_HEADER = "x-lifttrack-signed-out";

const EXPLICIT_SIGN_OUT_STORAGE = "lifttrack.signed-out";

export function hasGateSessionMarker(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${GATE_SESSION_MARKER_COOKIE}=`));
}

export function isExplicitSignOutRequest(headers: {
  get(name: string): string | null;
}): boolean {
  if (headers.get(EXPLICIT_SIGN_OUT_HEADER) === "1") return true;
  const cookie = headers.get("cookie");
  if (!cookie) return false;
  return cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${EXPLICIT_SIGN_OUT_COOKIE}=`));
}

/** Remember that this tab signed out, before the next page load asks for a session. */
export function markExplicitSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EXPLICIT_SIGN_OUT_STORAGE, "1");
  } catch {
    /* storage unavailable — the cookie below still counts */
  }
  document.cookie = `${EXPLICIT_SIGN_OUT_COOKIE}=1; Path=/; Max-Age=34560000; Secure; SameSite=Lax`;
}

/** Drop the sign-out hold so a real sign-in can open a session. */
export function clearExplicitSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EXPLICIT_SIGN_OUT_STORAGE);
  } catch {
    /* ignore */
  }
  document.cookie = `${EXPLICIT_SIGN_OUT_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
}

export function hasExplicitSignOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(EXPLICIT_SIGN_OUT_STORAGE) === "1") return true;
  } catch {
    /* ignore */
  }
  return document.cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${EXPLICIT_SIGN_OUT_COOKIE}=`));
}
