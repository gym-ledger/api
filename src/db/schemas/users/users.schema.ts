export const USERS_TABLE = "users";

export interface UsersInterface {
    id: string;

    phone_country_code: string;

    phone_number: string;

    email: string;

    first_name: string | null;

    last_name: string | null;

    password_hash: string | null;

    /** Set when the user finishes or skips onboarding; null sends them to it. */
    onboarded_at: Date | null;

    /** The PRIVACY_POLICY_VERSION the user last accepted. */
    privacy_policy_version: string | null;

    privacy_policy_accepted_at: Date | null;

    /** AI weekly check-ins are opt-in; nothing goes to the model provider while false. */
    ai_checkins_enabled: boolean;

    ai_checkins_consented_at: Date | null;

    /** When the user asked to delete their account (migration 041). */
    deletion_requested_at: Date | null;

    /** When the account and its data are deleted, unless the user cancels first. */
    deletion_scheduled_for: Date | null;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}

export const USERS_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    phone_country_code: {
        type: "string",
        allowNull: true,
    },
    phone_number: {
        type: "string",
        allowNull: true,
    },
    email: {
        type: "string",
        allowNull: true,
    },
    first_name: {
        type: "string",
        allowNull: true,
    },
    last_name: {
        type: "string",
        allowNull: true,
    },
    password_hash: {
        type: "string",
        allowNull: true,
    },
    onboarded_at: {
        type: "date",
        allowNull: true,
    },
    privacy_policy_version: {
        type: "string",
        allowNull: true,
    },
    privacy_policy_accepted_at: {
        type: "date",
        allowNull: true,
    },
    ai_checkins_enabled: {
        type: "boolean",
        allowNull: false,
    },
    ai_checkins_consented_at: {
        type: "date",
        allowNull: true,
    },
    deletion_requested_at: {
        type: "date",
        allowNull: true,
    },
    deletion_scheduled_for: {
        type: "date",
        allowNull: true,
    },
    deleted_at: {
        type: "date",
        allowNull: true,
    },
    created_at: {
        type: "date",
        allowNull: false,
    },
    updated_at: {
        type: "date",
        allowNull: false,
    },
}