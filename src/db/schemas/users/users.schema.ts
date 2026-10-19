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