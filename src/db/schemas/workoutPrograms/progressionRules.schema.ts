export const PROGRESSION_RULES_TABLE = "progression_rules";

export interface ProgressionRulesInterface {
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export const PROGRESSION_RULES_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    name: {
        type: "string",
        allowNull: true,
    },
    type: {
        type: "string",
        allowNull: true,
    },
    config: {
        type: "object",
        allowNull: true,
    },
    deleted_at: {
        type: "date",
        allowNull: true,
    },
    updated_at: {
        type: "date",
        allowNull: false,
    },
    created_at: {
        type: "date",
        allowNull: false,
    },
}