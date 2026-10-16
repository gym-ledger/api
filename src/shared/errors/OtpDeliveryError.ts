/**
 * An OTP could not be handed to the delivery provider (Resend / Twilio).
 * Deliberately not an AppError: the provider's message can contain account
 * details, so it is logged server-side and the client gets a generic reply.
 */
export class OtpDeliveryError extends Error {
    constructor(
        public readonly provider: "resend" | "twilio",
        message: string,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "OtpDeliveryError";
        Error.captureStackTrace(this, this.constructor);
    }
}
