-- Account deletion, data export, and the anonymous training totals kept
-- after an account is deleted.
--
-- Deletion: a user asks for it (re-entering their password, or a code sent
-- to them), every session ends, and deletion_scheduled_for is set 30 days
-- out. Signing in before then lets them cancel it. After it, a background job
-- (jobs/accountDeletion.ts) folds their training into
-- analytics_exercise_monthly and then deletes every row about them,
-- including the users row itself.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled_for
ON users(deletion_scheduled_for)
WHERE deletion_scheduled_for IS NOT NULL;

-- A code confirming an account deletion, for users without a password.
ALTER TABLE otp_auth DROP CONSTRAINT IF EXISTS otp_auth_purpose_check;
ALTER TABLE otp_auth ADD CONSTRAINT otp_auth_purpose_check
    CHECK (purpose IN ('login', 'reset_password', 'delete_account'));

-- Data exports ("Download your data"). Built by a background job
-- (jobs/dataExport.ts) into `content` (a JSON file), downloadable until
-- expires_at, after which the content is dropped and the row kept as history.
CREATE TABLE IF NOT EXISTS user_data_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'expired')),

    attempts INTEGER NOT NULL DEFAULT 0,

    content BYTEA,

    size_bytes INTEGER,

    error VARCHAR(500),

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_data_exports_user
ON user_data_exports(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_data_exports_pending
ON user_data_exports(requested_at)
WHERE status IN ('pending', 'processing');

-- Training totals of deleted accounts, for understanding how the app is used.
-- One row per exercise per calendar month, summed over every deleted account:
-- no user id, no per-person rows, no body weight or loads, nothing finer than
-- a month. `people` counts the deleted accounts that trained that exercise in
-- that month. Described in the privacy policy.
CREATE TABLE IF NOT EXISTS analytics_exercise_monthly (
    month DATE NOT NULL,

    exercise_id UUID NOT NULL,

    people INTEGER NOT NULL DEFAULT 0,

    sessions INTEGER NOT NULL DEFAULT 0,

    working_sets INTEGER NOT NULL DEFAULT 0,

    reps BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (month, exercise_id)
);
