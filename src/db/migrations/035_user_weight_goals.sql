-- Body-weight goals as entries, so ended goals are kept as history. A user
-- has at most one 'active' goal. The pace/target/date columns mean the same
-- as the ones 031 added to user_health_preferences (see the comment there).
--
-- `start_date` is when the goal starts counting from ("goal starts from"),
-- which may be earlier than the day it was entered; `start_weight` is the
-- user's 7-day average as of that date.
--
-- A goal ends as:
--   'completed'      — the date passed or the target was reached
--   'finished_early' — stopped before then, e.g. for a diet break
--   'cancelled'      — the goal wasn't the right fit
-- `end_reason` is one of the reasons the app offers for the last two (see
-- WEIGHT_GOAL_END_REASONS in users.weightGoal.utils.ts); `end_note` is the
-- user's own words. `end_weight` is their 7-day average on `end_date`.
CREATE TABLE IF NOT EXISTS user_weight_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    status VARCHAR(20) NOT NULL
        DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'finished_early', 'cancelled')),

    weight_goal VARCHAR(10) NOT NULL
        CHECK (weight_goal IN ('lose', 'maintain', 'gain')),

    weight_goal_preset VARCHAR(20)
        CHECK (weight_goal_preset IN ('mild_cut', 'extreme_cut', 'clean_bulk', 'dirty_bulk', 'custom')),

    custom_weekly_pace DECIMAL (6, 3)
        CHECK (custom_weekly_pace IS NULL OR custom_weekly_pace > 0),

    custom_weekly_pace_unit VARCHAR(6)
        CHECK (custom_weekly_pace_unit IN ('pct', 'weight')),

    target_weight DECIMAL (5, 2)
        CHECK (target_weight IS NULL OR target_weight > 0),

    start_date DATE NOT NULL,

    start_weight DECIMAL (5, 2),

    goal_date DATE,

    goal_date_source VARCHAR(10)
        CHECK (goal_date_source IN ('suggested', 'user')),

    end_date DATE,

    end_weight DECIMAL (5, 2),

    end_reason VARCHAR(30),

    end_note VARCHAR(500),

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CHECK ((status = 'active') = (end_date IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_weight_goals_one_active
ON user_weight_goals(user_id)
WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_weight_goals_user_start
ON user_weight_goals(user_id, start_date DESC)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_user_weight_goals_updated_at
ON user_weight_goals;

CREATE TRIGGER trigger_user_weight_goals_updated_at
BEFORE UPDATE ON user_weight_goals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Carry over the goals saved on the preferences row. Those columns are no
-- longer read or written after this migration; they stay so the migration
-- is safe to re-run and nothing is lost.
INSERT INTO user_weight_goals (
    user_id,
    weight_goal,
    weight_goal_preset,
    custom_weekly_pace,
    custom_weekly_pace_unit,
    target_weight,
    start_date,
    start_weight,
    goal_date,
    goal_date_source,
    created_at
)
SELECT
    hp.user_id,
    hp.weight_goal,
    hp.weight_goal_preset,
    hp.custom_weekly_pace,
    hp.custom_weekly_pace_unit,
    hp.target_weight,
    COALESCE(hp.goal_set_on, CURRENT_DATE),
    hp.goal_start_weight,
    hp.goal_date,
    hp.goal_date_source,
    NOW()
FROM user_health_preferences hp
WHERE hp.weight_goal IS NOT NULL
    AND hp.deleted_at IS NULL
    AND NOT EXISTS (
        SELECT 1
        FROM user_weight_goals g
        WHERE g.user_id = hp.user_id
            AND g.deleted_at IS NULL
    );
