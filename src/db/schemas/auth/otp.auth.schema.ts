export const OTP_AUTH_TABLE = "otp_auth";

export interface OtpAuthInterface {
    id: string;

    method: "email" | "phone";

    phoneNumber?: {
        code: string;
        number: string;
    } | null;

    email?: string | null;

    // TEMPORARY
    // Remove later in production
    otp?: string | null;

    otp_hash: string;

    generated_at: Date;

    expires_at: Date;

    attempts: number;

    is_deleted: boolean;

    created_at: Date;

    updated_at: Date;
}

export const OTP_AUTH_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    method: {
        type: "string",
        enum: ["email", "phone"],
        allowNull: false,
    },
    phone_number: {
        type: "string",
        unique: true,
        allowNull: true,
    },
    email: {
        type: "string",
        unique: true,
        allowNull: true,
    },
    otp: {
        type: "string",
        unique: false,
        allowNull: false,
    },
    generated_at: {
        type: "date",
        default: new Date(),
        allowNull: false,
    },
    expires_at: {
        type: "date",
        default: new Date(Date.now() + 1000 * 60 * 5),
        allowNull: false,
    },
    attempts: {
        type: "number",
        default: 0,
    },
    is_deleted: {
        type: "boolean",
        required: true,
        allowNull: false,
    },
};