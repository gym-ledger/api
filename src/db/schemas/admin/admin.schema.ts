export const ADMIN_USER_TABLE = "admin_users";

export interface AdminUserInterface {
    id: string;

    email: string;

    password_hash: string;

    refresh_token_hash: string;

    refresh_token_expires_at: Date;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}

export const ADMIN_USER_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    email: {
        type: "string",
        unique: true,
        allowNull: true,
    },
    password_hash: {
        type: "string",
        unique: false,
        allowNull: false,
    },
    refresh_token_hash: {
        type: "string",
        allowNull: true,
    },
    refresh_token_expires_at: {
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