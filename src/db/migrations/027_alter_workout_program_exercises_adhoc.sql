-- Allow a user to log a "workout_program_exercises" row that isn't part of
-- any admin-authored day/session — created ad-hoc, mid-session, when the
-- planned exercise isn't available. The TS schema for this table already
-- declared these columns nullable and already had added_by_user_id/
-- added_by_admin_user_id/visibility wired for exactly this; the DB migration
-- was never updated to match.

ALTER TABLE workout_program_exercises
    ALTER COLUMN workout_program_day_session_id DROP NOT NULL,
    ALTER COLUMN exercise_order DROP NOT NULL,
    ALTER COLUMN target_sets DROP NOT NULL,
    ALTER COLUMN min_reps DROP NOT NULL,
    ALTER COLUMN max_reps DROP NOT NULL,
    ADD COLUMN workout_session_id UUID
        REFERENCES workout_sessions(id);
