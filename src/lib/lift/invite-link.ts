const INVITE_TOKEN_KEY = "vestige.invite-token";

/** Invite token on this page load. A stored token from an earlier visit does not count. */
export function inviteTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
}

export function rememberInviteToken(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = inviteTokenFromUrl();
  if (fromUrl) {
    sessionStorage.setItem(INVITE_TOKEN_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(INVITE_TOKEN_KEY)?.trim() ?? "";
}

export function clearInviteToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(INVITE_TOKEN_KEY);
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/?invite=${encodeURIComponent(token)}`;
}
