import { env } from "../config/env.js";
import { OtpDeliveryError } from "../shared/errors/OtpDeliveryError.js";

const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Builds an E.164 number ("+919876543210") from the stored country code
 * ("+91" or "91") and national number. Returns null when the result can't be
 * a valid E.164 number, so Twilio is never handed a malformed recipient.
 */
export const toE164 = (countryCode: string, nationalNumber: string): string | null => {
    const code = String(countryCode ?? "").replace(/\D/g, "");
    const number = String(nationalNumber ?? "").replace(/\D/g, "");
    const e164 = `+${code}${number}`;
    return /^\+[1-9][0-9]{6,14}$/.test(e164) ? e164 : null;
};

/**
 * Sends an OTP over WhatsApp with Twilio's Messages API, using an approved
 * WhatsApp *authentication* template (TWILIO_WHATSAPP_CONTENT_SID) whose
 * variable {{1}} is the code. WhatsApp only allows business-initiated
 * messages from approved templates, so a free-form Body would be rejected.
 *
 * Resolves once Twilio has accepted (queued) the message. Delivery itself is
 * asynchronous: a recipient without WhatsApp shows up later as a failed
 * message in the Twilio console (e.g. error 63003), not as an error here.
 */
export const sendOtpWhatsApp = async ({ phoneNumber, otp }: {
    phoneNumber: { code: string, number: string },
    otp: string,
}): Promise<void> => {
    const {
        TWILIO_ACCOUNT_SID: accountSid,
        TWILIO_AUTH_TOKEN: authToken,
        TWILIO_WHATSAPP_FROM: from,
        TWILIO_MESSAGING_SERVICE_SID: messagingServiceSid,
        TWILIO_WHATSAPP_CONTENT_SID: contentSid,
    } = env;
    if (!env.PHONE_OTP_ENABLED || !accountSid || !authToken || !contentSid || (!from && !messagingServiceSid)) {
        throw new OtpDeliveryError("twilio", "WhatsApp delivery is not configured");
    }

    const to = toE164(phoneNumber.code, phoneNumber.number);
    if (!to) {
        throw new OtpDeliveryError("twilio", "Phone number can't be converted to E.164");
    }

    const params = new URLSearchParams();
    params.set("To", `whatsapp:${to}`);
    // A Messaging Service picks the sender itself; otherwise send from the number.
    if (messagingServiceSid) {
        params.set("MessagingServiceSid", messagingServiceSid);
    } else {
        params.set("From", `whatsapp:${from!.replace(/^whatsapp:/, "")}`);
    }
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify({ "1": otp }));

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
    } catch (error) {
        throw new OtpDeliveryError("twilio", "Request to Twilio failed", {
            cause: error instanceof Error ? error.message : String(error),
        });
    }

    if (!res.ok) {
        // Twilio errors look like { code, message, more_info, status }.
        const body = await res.json().catch(() => null) as { code?: number, message?: string, more_info?: string } | null;
        throw new OtpDeliveryError("twilio", `Twilio rejected the message (HTTP ${res.status})`, {
            status: res.status,
            code: body?.code,
            message: body?.message,
            moreInfo: body?.more_info,
        });
    }
};
