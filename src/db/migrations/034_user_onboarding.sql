-- Answers from the web-app onboarding wizard. Nullable because every existing
-- row predates onboarding. Today only `training_days_per_week` drives
-- anything (plan suggestions match it against a version's `training_days`);
-- the rest is kept for later matching once plans carry goal/level/equipment.
ALTER TABLE user_health_preferences
    ADD COLUMN IF NOT EXISTS training_goal VARCHAR(20)
        CHECK (training_goal IN ('build_muscle', 'get_stronger', 'lose_fat', 'general_fitness')),
    ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20)
        CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
    ADD COLUMN IF NOT EXISTS training_days_per_week SMALLINT
        CHECK (training_days_per_week BETWEEN 1 AND 7),
    ADD COLUMN IF NOT EXISTS equipment VARCHAR(20)
        CHECK (equipment IN ('full_gym', 'home_dumbbells', 'bodyweight'));

-- Set when the user finishes or skips onboarding. It lives on `users`, not on
-- the preferences row, because skipping leaves no preferences row behind.
-- NULL sends the user to onboarding on their next visit, existing users too.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
