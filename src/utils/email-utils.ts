import { env } from "../config/env.js";
import { OtpDeliveryError } from "../shared/errors/OtpDeliveryError.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const PROVIDER_TIMEOUT_MS = 10_000;

export type OtpTemplate = "otp-login" | "otp-reset-password" | "otp-delete-account";

/** True when Resend is configured; otherwise emails can't be sent. */
export const isEmailDeliveryConfigured = () => !!env.RESEND_API_KEY && !!env.EMAIL_FROM;

const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildOtpEmail = (otp: string, template: OtpTemplate, ttlMinutes: number) => {
    const appName = env.APP_NAME;
    const { action, subject, ignoreNote } = {
        "otp-login": {
            action: "sign in",
            subject: `${otp} is your ${appName} sign-in code`,
            ignoreNote: "If you didn't ask for this code, you can ignore this email.",
        },
        "otp-reset-password": {
            action: "reset your password",
            subject: `${otp} is your ${appName} password reset code`,
            ignoreNote: "If you didn't ask for this code, you can ignore this email.",
        },
        "otp-delete-account": {
            action: "confirm deleting your account",
            subject: `${otp} is your ${appName} account deletion code`,
            ignoreNote: "If you didn't ask to delete your account, don't share this code with anyone; your account stays as it is.",
        },
    }[template];
    const text = [
        `Your ${appName} code is ${otp}.`,
        "",
        `Use it to ${action}. It expires in ${ttlMinutes} minutes.`,
        "",
        ignoreNote,
    ].join("\n");
    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;">
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;font-size:14px;color:#555;">${escapeHtml(appName)}</p>
        <p style="margin:0 0 24px;font-size:16px;">Use this code to ${escapeHtml(action)}:</p>
        <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px;">${escapeHtml(otp)}</p>
        <p style="margin:0;font-size:13px;color:#555;">It expires in ${ttlMinutes} minutes. ${escapeHtml(ignoreNote)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
    return { subject, text, html };
};

/**
 * Sends an OTP email through Resend's REST API. Resolves once Resend has
 * accepted the message; throws OtpDeliveryError otherwise (bad key, unverified
 * sender domain, rate limit, network failure, timeout).
 */
export const sendOtpEmail = async ({ email, otp, template, ttlMinutes }: {
    email: string,
    otp: string,
    template: OtpTemplate,
    ttlMinutes: number,
}): Promise<void> => {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
        throw new OtpDeliveryError("resend", "Email delivery is not configured (RESEND_API_KEY / EMAIL_FROM)");
    }

    const { subject, text, html } = buildOtpEmail(otp, template, ttlMinutes);

    let res: Response;
    try {
        res = await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: env.EMAIL_FROM,
                to: [email],
                subject,
                text,
                html,
            }),
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
    } catch (error) {
        throw new OtpDeliveryError("resend", "Request to Resend failed", {
            cause: error instanceof Error ? error.message : String(error),
        });
    }

    if (!res.ok) {
        // Resend errors look like { statusCode, name, message }.
        const body = await res.json().catch(() => null) as { name?: string, message?: string } | null;
        throw new OtpDeliveryError("resend", `Resend rejected the email (HTTP ${res.status})`, {
            status: res.status,
            name: body?.name,
            message: body?.message,
        });
    }
};
