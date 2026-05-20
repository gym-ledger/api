// CREATE TABLE progression_rules(
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

//     name VARCHAR(255) NOT NULL,

//     type VARCHAR(50) NOT NULL
//         CHECK(
//         type IN(
//             'double_progression',
//             'static_load',
//             'rir_based',
//             'rir_cycling',
//             'percentage_based'
//         )
//     ),

//     config JSONB NOT NULL,

//     deleted_at TIMESTAMPTZ,

//     created_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW(),

//     updated_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW()

// );

export const PROGRESSION_RULES_TABLE = "progression_rules";

export interface ProgressionRulesInterface {
    id: string;
    name: string;
    type: string;
    config: any;
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