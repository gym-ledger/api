export const USER_SESSIONS_TABLE = "user_sessions";

export interface UserSessionsInterface {
    id: string;

    user_id: string;

    refresh_token_hash: string;

    expires_at: Date;

    revoked_at: Date;

    created_at: Date;

    last_used_at: Date;
}

export const USER_SESSIONS_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    user_id: {
        type: "string",
        allowNull: false,
    },
    refresh_token_hash: {
        type: "string",
        allowNull: false,
    },
    expires_at: {
        type: "date",
        allowNull: false,
    },
    revoked_at: {
        type: "date",
        allowNull: true,
    },
    created_at: {
        type: "date",
        allowNull: false,
    },
    last_used_at: {
        type: "date",
        allowNull: true,
    },
}