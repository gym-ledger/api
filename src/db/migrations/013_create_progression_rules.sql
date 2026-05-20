CREATE TABLE progression_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    type VARCHAR(50) NOT NULL
        CHECK (
            type IN (
                'double_progression',
                'static_load',
                'rir_based',
                'rir_cycling',
                'percentage_based'
            )
        ),

    config JSONB NOT NULL,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE TRIGGER trigger_progression_rules_updated_at
BEFORE UPDATE ON progression_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();