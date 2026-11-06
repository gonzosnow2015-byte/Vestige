const CREATE_INTENT = "vestige.create-company";

/** True when Google/X was started from Create account, not Sign in. */
export function hasCreateIntent(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("create") === "company") return true;
  try {
    return window.sessionStorage.getItem(CREATE_INTENT) === "1";
  } catch {
    return false;
  }
}

export function markCreateIntent(): void {
  try {
    window.sessionStorage.setItem(CREATE_INTENT, "1");
  } catch {
    /* the ?create=company callback still carries the intent */
  }
}

export function clearCreateIntent(): void {
  try {
    window.sessionStorage.removeItem(CREATE_INTENT);
  } catch {
    /* ignore */
  }
}

const setupListeners = new Set<() => void>();
let accountSetup = false;

/** Hold the sign-in screen while email sign-up is still creating the company. */
export function beginAccountSetup(): void {
  accountSetup = true;
  setupListeners.forEach((listener) => listener());
}

export function endAccountSetup(): void {
  accountSetup = false;
  setupListeners.forEach((listener) => listener());
}

export function isAccountSetup(): boolean {
  return accountSetup;
}

export function subscribeAccountSetup(listener: () => void): () => void {
  setupListeners.add(listener);
  return () => {
    setupListeners.delete(listener);
  };
}
