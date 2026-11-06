import { getRequest } from "@tanstack/react-start/server";
import { env } from "@/lib/env.server";
import {
  inviteEmailContent,
  linkSendBlock,
  mailConfigError,
  type InviteMailInput,
  type InviteMailResult,
} from "@/lib/lift/invite-mail";

export function invitePageUrl(token: string): string {
  const origin = publicOrigin();
  const path = `/?invite=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

function publicOrigin(): string {
  const explicit = env("BETTER_AUTH_URL") ?? env("APP_URL");
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      return explicit.replace(/\/+$/, "");
    }
  }
  try {
    const request = getRequest();
    if (!request) return "";
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = (forwardedHost || request.headers.get("host") || "").trim();
    if (!host) return "";
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      forwardedProto ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

export async function sendInviteEmail(input: InviteMailInput): Promise<InviteMailResult> {
  const configError = mailConfigError({
    RESEND_API_KEY: env("RESEND_API_KEY"),
    INVITE_FROM: env("INVITE_FROM"),
  });
  if (configError) return { emailed: false, emailError: configError };
  const blocked = linkSendBlock(input.link);
  if (blocked) return { emailed: false, emailError: blocked };

  const from = env("INVITE_FROM");
  const key = env("RESEND_API_KEY");
  if (!from || !key) return { emailed: false, emailError: mailConfigError({}) };
  const content = inviteEmailContent(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return { emailed: true, emailError: null };
    return {
      emailed: false,
      emailError: `Resend did not send the email (${response.status}): ${await readResendError(response)} The invite is saved — copy the link and share it.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The mail service did not respond.";
    return {
      emailed: false,
      emailError: `Could not reach the mail service: ${message} The invite is saved — copy the link and share it.`,
    };
  }
}

async function readResendError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  } catch {
    // Non-JSON body. The status code is enough.
  }
  return "The mail service returned an error.";
}
