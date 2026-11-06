// @ts-check
/**
 * The sign-out sequence used by `src/lib/auth/client.ts`, kept here as a pure
 * module so its effects can be unit-tested (`node --test` only covers
 * `scripts/`), the same split `migration-plan.mjs` uses for the two appliers.
 *
 * The two environments authenticate differently, so they need different
 * answers to "the server did not reply":
 *
 * - **Live preview** — a partitioned iframe with no readable session cookie;
 *   the session rides the bearer token in `sessionStorage`. Dropping that token
 *   IS being signed out, so the server call is best effort and a wedged request
 *   must never strand the button. This is where the hang actually happens.
 * - **Deployed** — the session rides an HttpOnly `__Host-` cookie that JS
 *   cannot delete. ONLY a completed sign-out response clears it, and
 *   `server.ts` enables `session.cookieCache` (maxAge 300), so `/get-session`
 *   would keep answering from the cached cookie for minutes afterwards.
 *   Redirecting on a timeout would show the visitor "signed out" while their
 *   session is still live — so here we fail loudly instead of pretending.
 */

/**
 * Live preview: aggressive, because the local clear is what signs the user out.
 * The same-origin POST normally answers in tens of ms; lower would start
 * abandoning slow-but-working sign-outs for no gain.
 */
export const PREVIEW_SIGN_OUT_TIMEOUT_MS = 1500;

/**
 * Deployed: generous, because only the server can end this session — but still
 * bounded, so a wedged request reports failure the visitor can retry instead of
 * spinning forever. A sign-out still unanswered at 10s is not going to land.
 */
export const DEPLOYED_SIGN_OUT_TIMEOUT_MS = 10_000;

/**
 * How long to wait for a sign-out in this environment. Every sign-out network
 * call picks its bound here, so the preview/deployed split cannot drift apart
 * between callers.
 * @param {boolean} livePreview
 * @returns {number}
 */
export function signOutTimeoutMs(livePreview) {
  return livePreview ? PREVIEW_SIGN_OUT_TIMEOUT_MS : DEPLOYED_SIGN_OUT_TIMEOUT_MS;
}

/**
 * Run `start()` but give up after `timeoutMs`, reporting which happened. Never
 * rejects — callers decide what a failure means, and a `try/catch` around an
 * `await` does nothing for a promise that never settles.
 * @param {() => unknown} start
 * @param {number} timeoutMs
 * @returns {Promise<"ok" | "failed" | "timeout">}
 */
export function settleWithin(start, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    /** @param {"ok" | "failed"} outcome */
    const done = (outcome) => {
      clearTimeout(timer);
      resolve(outcome);
    };
    try {
      Promise.resolve(start()).then(
        () => done("ok"),
        () => done("failed"),
      );
    } catch {
      done("failed");
    }
  });
}

/**
 * @typedef {object} SignOutSteps
 * @property {boolean} livePreview Whether the app is the sandbox preview iframe.
 * @property {boolean} hasBearer Whether a preview bearer token is stored.
 * @property {() => unknown} requestSignOut Ask the server to end the session; must reject on a failed response.
 * @property {() => void} clearToken Drop the stored bearer token.
 * @property {() => void} redirect Leave the page.
 * @property {() => void} [onSignedOut] Remember an explicit sign-out. Called only when sign-out proceeds.
 * @property {number} [timeoutMs]
 */

/**
 * End the session, then clear the local token and redirect.
 *
 * In the live preview those last two always run. When deployed they run only if
 * the server confirmed, because nothing else can clear the cookie — a failed or
 * timed-out sign-out throws rather than reporting a sign-out that did not
 * happen.
 * @param {SignOutSteps} steps
 * @returns {Promise<void>}
 */
export async function runSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  redirect,
  onSignedOut,
  timeoutMs,
}) {
  if (livePreview) {
    // Always ask the server. Email/password sessions in the preview are cookies,
    // not the bearer token — skipping the request left that session live, and
    // the next page load signed the visitor straight back in. The wait stays
    // bounded so a wedged request cannot strand the button; the local clear
    // still runs afterwards.
    void hasBearer;
    await settleWithin(requestSignOut, timeoutMs ?? signOutTimeoutMs(livePreview));
    onSignedOut?.();
    clearToken();
    redirect();
    return;
  }

  const outcome = await settleWithin(requestSignOut, timeoutMs ?? signOutTimeoutMs(livePreview));
  if (outcome !== "ok") {
    throw new Error(
      outcome === "timeout"
        ? "Sign-out timed out — you are still signed in. Please try again."
        : "Sign-out failed — you are still signed in. Please try again.",
    );
  }
  onSignedOut?.();
  clearToken();
  redirect();
}

/**
 * @typedef {object} PreSignInSteps
 * @property {boolean} livePreview Whether the app is the sandbox preview iframe.
 * @property {boolean} hasBearer Whether a preview bearer token is stored.
 * @property {() => unknown} requestSignOut Ask the server to end any prior session.
 * @property {() => void} clearToken Drop the stored bearer token.
 * @property {number} [timeoutMs]
 */

/**
 * Drop any prior session before a new sign-in starts, so switching providers
 * actually switches identity.
 *
 * Deliberately BEST EFFORT — unlike `runSignOut` this never throws. It also
 * runs when there is no prior session at all, so treating a failure as fatal
 * would block first-time sign-in on a transport hiccup, for a visitor with no
 * session to protect. The subsequent OAuth flow issues a fresh session either
 * way. Only the wait is bounded, and by the same per-environment rule as
 * `runSignOut`: a deployed session dies server-side, so it gets the full
 * window rather than the preview's aggressive one.
 * @param {PreSignInSteps} steps
 * @returns {Promise<void>}
 */
export async function runPreSignInSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  timeoutMs,
}) {
  // Always ask the server, including the preview with no bearer. An email
  // session there is still a cookie, and leaving it in place lets the next
  // load sign the visitor back in. Best effort: a failure must not block
  // first-time sign-in.
  void hasBearer;
  await settleWithin(requestSignOut, timeoutMs ?? signOutTimeoutMs(livePreview));
  clearToken();
}
