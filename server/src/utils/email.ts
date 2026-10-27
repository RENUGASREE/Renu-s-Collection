import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function createTransporter(options?: { forcePort?: number; forceSecure?: boolean }): nodemailer.Transporter | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const rawPass = env.SMTP_PASS?.trim();
  const pass = rawPass?.replace(/\s+/g, "");

  if (!host || !user || !pass) {
    return null;
  }

  const isGmail = host.toLowerCase().includes("gmail") || user.toLowerCase().endsWith("@gmail.com");

  // Determine port and secure flag
  let port = options?.forcePort ?? (env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined);
  let secure = options?.forceSecure;

  if (isGmail) {
    // For Gmail on cloud hosting (Render, AWS, DigitalOcean), port 465 with SSL is required
    // because cloud providers frequently block or throttle outbound port 587 / 25.
    if (!port || port === 587) {
      port = 465;
    }
  } else if (!port) {
    port = 587;
  }

  if (secure === undefined) {
    secure = port === 465;
  }

  return nodemailer.createTransport({
    host: isGmail ? "smtp.gmail.com" : host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000, // 10s connection timeout to prevent hanging HTTP responses
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(
    env.RESEND_API_KEY ||
    env.BREVO_API_KEY ||
    (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
  );
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<{ delivered: boolean; configured: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { delivered: false, configured: false };
  }

  // Priority 1: Resend HTTP API (Port 443 HTTPS - Works 100% on Render Free Tier)
  if (env.RESEND_API_KEY) {
    try {
      const from =
        env.EMAIL_FROM && !env.EMAIL_FROM.includes("reyanluxe.com")
          ? env.EMAIL_FROM
          : "Renu's Collections <onboarding@resend.dev>";

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          html: params.html ?? params.text,
          reply_to: params.replyTo,
        }),
      });

      const data = (await res.json()) as any;
      if (res.ok && data?.id) {
        console.log("[Email] Delivered successfully via Resend HTTP API:", data.id);
        return { delivered: true, configured: true };
      } else {
        const errMsg = data?.message || JSON.stringify(data);
        console.error("[Email] Resend API error:", errMsg);
        return { delivered: false, configured: true, error: `Resend error: ${errMsg}` };
      }
    } catch (err: any) {
      console.error("[Email] Resend fetch failed:", err?.message || err);
      return { delivered: false, configured: true, error: err?.message || "Resend network error" };
    }
  }

  // Priority 2: Brevo HTTP API (Port 443 HTTPS - Works 100% on Render Free Tier)
  if (env.BREVO_API_KEY) {
    try {
      const fromEmail =
        env.EMAIL_FROM && !env.EMAIL_FROM.includes("reyanluxe.com")
          ? env.EMAIL_FROM
          : (env.SMTP_USER || "renuscollection05@gmail.com");

      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Renu's Collections", email: fromEmail },
          to: [{ email: params.to }],
          subject: params.subject,
          textContent: params.text,
          htmlContent: params.html ?? params.text,
          replyTo: params.replyTo ? { email: params.replyTo } : undefined,
        }),
      });

      const data = (await res.json()) as any;
      if (res.ok && (data?.messageId || data?.messageIds)) {
        console.log("[Email] Delivered successfully via Brevo HTTP API:", data.messageId);
        return { delivered: true, configured: true };
      } else {
        const errMsg = data?.message || JSON.stringify(data);
        console.error("[Email] Brevo API error:", errMsg);
        return { delivered: false, configured: true, error: `Brevo error: ${errMsg}` };
      }
    } catch (err: any) {
      console.error("[Email] Brevo fetch failed:", err?.message || err);
      return { delivered: false, configured: true, error: err?.message || "Brevo network error" };
    }
  }

  // Priority 3: Direct SMTP (Only works on hosts without blocked outbound SMTP ports)
  const user = env.SMTP_USER?.trim();
  const from =
    env.EMAIL_FROM && !env.EMAIL_FROM.includes("reyanluxe.com")
      ? env.EMAIL_FROM
      : user
      ? `Renu's Collections <${user}>`
      : "renuscollection05@gmail.com";

  let mailer = createTransporter();
  if (!mailer) {
    return { delivered: false, configured: false };
  }

  try {
    await mailer.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? params.text,
      replyTo: params.replyTo,
    });
    return { delivered: true, configured: true };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error("[Email] Primary send attempt failed:", errorMsg);

    // If it was a connection timeout or network block on port 587, try fallback to port 465 (SSL)
    if (
      (errorMsg.includes("timeout") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ETIMEDOUT")) &&
      env.SMTP_PORT !== 465
    ) {
      console.log("[Email] Retrying via port 465 (SSL) fallback...");
      try {
        const fallbackMailer = createTransporter({ forcePort: 465, forceSecure: true });
        if (fallbackMailer) {
          await fallbackMailer.sendMail({
            from,
            to: params.to,
            subject: params.subject,
            text: params.text,
            html: params.html ?? params.text,
            replyTo: params.replyTo,
          });
          console.log("[Email] Fallback via port 465 succeeded!");
          return { delivered: true, configured: true };
        }
      } catch (fallbackErr: any) {
        console.error("[Email] Fallback send attempt also failed:", fallbackErr?.message || fallbackErr);
      }
    }

    return { delivered: false, configured: true, error: errorMsg };
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Reset your Renu's Collections password",
    text: `Reset your password using this link (valid for 1 hour): ${resetUrl}`,
    html: `
      <p>You requested a password reset for your Renu's Collections account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  });
}
