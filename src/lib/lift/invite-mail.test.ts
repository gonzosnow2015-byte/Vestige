import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, inviteEmailContent, linkSendBlock, mailConfigError } from "./invite-mail.ts";

const amp = "&";

describe("invite mail", () => {
  it("names the missing provider instead of pretending an email went out", () => {
    const message = mailConfigError({});
    assert.ok(message);
    assert.match(message, /RESEND_API_KEY/);
    assert.match(message, /INVITE_FROM/);
    assert.equal(mailConfigError({ RESEND_API_KEY: "re_test", INVITE_FROM: "Vestige <a@b.co>" }), null);
  });

  it("refuses a link that is not a public URL", () => {
    assert.match(linkSendBlock("/?invite=abc") ?? "", /BETTER_AUTH_URL/);
    assert.equal(linkSendBlock("https://vestige.example/?invite=abc"), null);
  });

  it("puts the link in the email and escapes the company name", () => {
    const content = inviteEmailContent({
      to: "inspector@yard.test",
      companyName: "North <Yard>",
      role: "inspector",
      link: "https://vestige.example/?invite=abc",
    });
    assert.match(content.text, /https:\/\/vestige\.example\/\?invite=abc/);
    assert.match(content.text, /inspector@yard\.test/);
    assert.ok(content.html.includes("North " + amp + "lt;Yard" + amp + "gt;"));
    assert.equal(escapeHtml("<"), amp + "lt;");
    assert.equal(escapeHtml('"'), amp + "quot;");
    assert.equal(escapeHtml(amp), amp + "amp;");
  });
});
