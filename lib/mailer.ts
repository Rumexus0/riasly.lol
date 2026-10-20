// riasly — SMTP mail transport (Nodemailer). SERVER ONLY.
//
// Why this exists: the email-change confirmation code and the 2FA login code used
// to be surfaced straight to the browser because there was no mail transport. This
// module is that transport, so those codes can now be delivered to the recipient's
// inbox and never touch the client.
//
// The contract mirrors lib/discord-guild.ts: nothing here may throw. When SMTP is
// not configured (or a send fails) `sendMail` returns false and logs a short,
// non-identifying warning, so callers can fail closed (show "couldn't send")
// instead of crashing a request or leaking the code.
//
// Config lives in .env: SMTP_HOST, SMTP_PORT (587 STARTTLS / 465 TLS), SMTP_USER,
// SMTP_PASS, and an optional SMTP_FROM that defaults to SMTP_USER.

import nodemailer, { type Transporter } from "nodemailer";

/** Are the minimum credentials present? Everything no-ops when they are not. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Built once and reused; creating a transport per send is wasteful and nodemailer
// pools connections internally.
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!mailConfigured()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; every other port (587/25) uses STARTTLS upgrade.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send one message. Returns true only on a real accepted send; false when SMTP is
 * unconfigured or the provider rejected it. Never throws.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn("[mailer] SMTP not configured — skipped a send");
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch {
    // Never log the recipient or the body — a generic line is enough to debug setup.
    console.warn("[mailer] a send failed");
    return false;
  }
}

/**
 * A minimal, self-contained HTML body for a numeric verification code. Kept inline
 * (no template engine) so a code email has zero extra dependencies and renders the
 * same everywhere. `purpose` is a short human phrase naming what the code is for.
 */
export function codeEmailHtml(code: string, purpose: string): string {
  const safe = code.replace(/[<>&]/g, "");
  return `<!doctype html><html><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0f;color:#f2f2f5">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Use the code below to complete your ${purpose} on riasly. It expires in a few minutes and works once.</p>
    <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 20px;text-align:center;color:#a78bfa">${safe}</p>
    <p style="font-size:13px;line-height:1.5;color:#9a9aa5;margin:0">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body></html>`;
}
