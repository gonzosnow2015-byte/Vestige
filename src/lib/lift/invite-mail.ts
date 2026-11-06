import { ROLE_LABEL, type Role } from "./types.ts";

export type InviteMailInput = {
  to: string;
  companyName: string;
  role: Role;
  link: string;
};

export type InviteMailResult = {
  emailed: boolean;
  emailError: string | null;
};

const SAVED = "The invite is saved — copy the link and share it.";

const NOT_CONFIGURED =
  "No email was sent. This server has no mail provider. On the published app, set RESEND_API_KEY (an API key from resend.com) and INVITE_FROM (a verified sender, for example Vestige <invites@yourdomain.com>). " +
  SAVED;

export function mailConfigError(env: { RESEND_API_KEY?: string; INVITE_FROM?: string }): string | null {
  const key = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.INVITE_FROM?.trim() ?? "";
  if (!key && !from) return NOT_CONFIGURED;
  if (!key) {
    return `INVITE_FROM is set, but RESEND_API_KEY is missing. Add the Resend API key on the published app, then invite again. ${SAVED}`;
  }
  if (!from) {
    return `RESEND_API_KEY is set, but INVITE_FROM is missing. Set it to a verified sender, for example Vestige <invites@yourdomain.com>. ${SAVED}`;
  }
  if (/[\r\n]/.test(from)) return `INVITE_FROM must be a single line. ${SAVED}`;
  return null;
}

export function linkSendBlock(link: string): string | null {
  if (/^https?:\/\//i.test(link)) return null;
  return `Could not build a public invite link for the email. Set BETTER_AUTH_URL to this app’s public address. ${SAVED}`;
}

export function escapeHtml(value: string): string {
  const amp = "&";
  return value
    .replaceAll(amp, amp + "amp;")
    .replaceAll("<", amp + "lt;")
    .replaceAll(">", amp + "gt;")
    .replaceAll('"', amp + "quot;");
}

export function inviteEmailContent(input: InviteMailInput): { subject: string; text: string; html: string } {
  const role = ROLE_LABEL[input.role];
  const company = input.companyName.trim() || "your company";
  const subject = `Invite to ${company} on Vestige`;
  const text = [
    `${company} invited you to Vestige as ${role}.`,
    "",
    `Open this link and sign in or create an account with ${input.to}:`,
    "",
    input.link,
    "",
    "The link only works for this email address.",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(company)} invited you to Vestige as ${escapeHtml(role)}.</p>`,
    `<p>Open this link and sign in or create an account with ${escapeHtml(input.to)}:</p>`,
    `<p><a href="${escapeHtml(input.link)}">${escapeHtml(input.link)}</a></p>`,
    "<p>The link only works for this email address.</p>",
  ].join("");
  return { subject, text, html };
}
