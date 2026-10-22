-- Body-weight goal, kept on the user's health preferences (one goal at a
-- time). `weight_goal_preset` is the pace the user picked (rates in
-- utils/users/users.weightGoal.utils.ts); it is NULL for "maintain".
-- 'custom' means the user typed their own pace into `custom_weekly_pace`,
-- either as % of body weight (`custom_weekly_pace_unit` = 'pct') or in their
-- weight units ('weight'), always unsigned — the goal gives the direction.
-- `goal_date` is either the date the API suggested from that pace or one the
-- user set themselves; `goal_date_source` records which. `goal_start_weight`
-- and `goal_set_on` are snapshotted when the goal is saved so progress can be
-- measured from where the user started.
ALTER TABLE user_health_preferences
    ADD COLUMN IF NOT EXISTS weight_goal VARCHAR(10)
        CHECK (weight_goal IN ('lose', 'maintain', 'gain')),
    ADD COLUMN IF NOT EXISTS weight_goal_preset VARCHAR(20)
        CHECK (weight_goal_preset IN ('mild_cut', 'extreme_cut', 'clean_bulk', 'dirty_bulk', 'custom')),
    ADD COLUMN IF NOT EXISTS custom_weekly_pace DECIMAL (6, 3)
        CHECK (custom_weekly_pace IS NULL OR custom_weekly_pace > 0),
    ADD COLUMN IF NOT EXISTS custom_weekly_pace_unit VARCHAR(6)
        CHECK (custom_weekly_pace_unit IN ('pct', 'weight')),
    ADD COLUMN IF NOT EXISTS target_weight DECIMAL (5, 2)
        CHECK (target_weight IS NULL OR target_weight > 0),
    ADD COLUMN IF NOT EXISTS goal_date DATE,
    ADD COLUMN IF NOT EXISTS goal_date_source VARCHAR(10)
        CHECK (goal_date_source IN ('suggested', 'user')),
    ADD COLUMN IF NOT EXISTS goal_start_weight DECIMAL (5, 2),
    ADD COLUMN IF NOT EXISTS goal_set_on DATE;

-- One AI-written check-in per user per completed Monday-Sunday week (in the
-- user's timezone). `stats` holds the numbers computed in SQL — the model
-- only writes `content` from them. A row is claimed as 'pending' before the
-- model is called so concurrent requests never call it twice. 'skipped'
-- means the week didn't meet the data requirements for a model call
-- (see users.checkins.service.ts); `skip_reasons` says which ones.
CREATE TABLE IF NOT EXISTS user_weekly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    week_start DATE NOT NULL,

    status VARCHAR(10) NOT NULL
        CHECK (status IN ('pending', 'ready', 'failed', 'skipped')),

    stats JSONB NOT NULL,

    skip_reasons JSONB,

    content JSONB,

    model VARCHAR(100),

    attempts INTEGER NOT NULL
        DEFAULT 0,

    next_retry_at TIMESTAMPTZ,

    generated_at TIMESTAMPTZ,

    dismissed_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_weekly_checkins_user_week
ON user_weekly_checkins(user_id, week_start)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_user_weekly_checkins_updated_at
ON user_weekly_checkins;

CREATE TRIGGER trigger_user_weekly_checkins_updated_at
BEFORE UPDATE ON user_weekly_checkins
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
