-- A planned training day the user chose to take off (sick, travel, ...), so
-- it doesn't break their streak. One row per user per local calendar day.
-- Days can be marked up to 2 days back and up to 60 days ahead (a trip); a
-- whole range is stored as one row per planned day in it.
--
-- A day off only counts when that weekday is still a planned training day
-- and no workout was completed on it (a workout always wins). At most 10
-- counted days off in any rolling 30 days protect the streak; past that the
-- row is kept but the streak breaks there (see src/modules/users/
-- users.daysOff/daysOff.rules.ts).
--
-- `note` is free text from the user and never leaves the server: the weekly
-- check-in sends only the categories to the AI provider.
CREATE TABLE IF NOT EXISTS user_days_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    day DATE NOT NULL,

    category VARCHAR(20) NOT NULL
        CHECK (category IN ('sick', 'injury', 'low_energy', 'sore', 'travel', 'work', 'family', 'other')),

    note VARCHAR(280),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_days_off_user_day UNIQUE (user_id, day),

    CONSTRAINT chk_user_days_off_other_note
        CHECK (category <> 'other' OR (note IS NOT NULL AND btrim(note) <> ''))
);
