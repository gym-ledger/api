-- Selecting an admin-authored plan now gives the user their own copy of it
-- (program -> version -> days -> sessions -> exercises), owned by the user and
-- linked back to the admin source, so the user can edit their plan without
-- touching anyone else's. The source link is what lets the app offer "a newer
-- version of this plan is available" and reset the copy to it.

ALTER TABLE workout_programs
    ADD COLUMN IF NOT EXISTS source_workout_program_id UUID
        REFERENCES workout_programs(id);

ALTER TABLE workout_program_versions
    ADD COLUMN IF NOT EXISTS source_workout_program_version_id UUID
        REFERENCES workout_program_versions(id);

-- An exercise added to the plan mid-workout ("all future sessions") takes its
-- planned sets/reps from what the user logs in that workout; this points at
-- the workout whose sets define them.
ALTER TABLE workout_program_exercises
    ADD COLUMN IF NOT EXISTS targets_from_workout_session_id UUID
        REFERENCES workout_sessions(id);

CREATE INDEX IF NOT EXISTS idx_workout_programs_source_workout_program_id
ON workout_programs(source_workout_program_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_program_versions_source_version_id
ON workout_program_versions(source_workout_program_version_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_program_exercises_targets_from_session
ON workout_program_exercises(targets_from_workout_session_id)
WHERE targets_from_workout_session_id IS NOT NULL;

-- Deep-copies one program version into a user-owned private version.
-- With p_target_program_id NULL a new user-owned program is created for it
-- (version 1); otherwise the copy becomes the next version of that program
-- (used to reset a user's copy to a newer admin version). Returns the new
-- version's id. Ad-hoc, session-scoped exercise rows are not copied.
CREATE OR REPLACE FUNCTION fork_workout_program_version(
    p_source_version_id UUID,
    p_user_id UUID,
    p_target_program_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_src_version workout_program_versions%ROWTYPE;
    v_src_program workout_programs%ROWTYPE;
    v_program_id UUID;
    v_version_id UUID := gen_random_uuid();
    v_version_number INTEGER := 1;
    v_day_id UUID;
    v_session_id UUID;
    r_day RECORD;
    r_session RECORD;
BEGIN
    SELECT * INTO v_src_version
    FROM workout_program_versions
    WHERE id = p_source_version_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'workout program version % not found', p_source_version_id;
    END IF;

    SELECT * INTO v_src_program
    FROM workout_programs
    WHERE id = v_src_version.workout_program_id;

    IF p_target_program_id IS NULL THEN
        v_program_id := gen_random_uuid();
        INSERT INTO workout_programs (
            id, name, slug, added_by_user_id, visibility, source_workout_program_id
        ) VALUES (
            v_program_id,
            v_src_program.name,
            -- Slugs are unique across all live programs, admin and user alike.
            v_src_program.slug || '-' || substr(replace(v_program_id::text, '-', ''), 1, 12),
            p_user_id,
            'private',
            v_src_program.id
        );
    ELSE
        v_program_id := p_target_program_id;
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
        FROM workout_program_versions
        WHERE workout_program_id = v_program_id;
    END IF;

    INSERT INTO workout_program_versions (
        id, workout_program_id, description, version_number, version_name,
        training_days, split_type, session_ordering_logic, duration_type,
        duration_weeks, added_by_user_id, visibility, source_workout_program_version_id
    ) VALUES (
        v_version_id, v_program_id, v_src_version.description, v_version_number,
        v_src_version.version_name, v_src_version.training_days, v_src_version.split_type,
        v_src_version.session_ordering_logic, v_src_version.duration_type,
        v_src_version.duration_weeks, p_user_id, 'private', v_src_version.id
    );

    FOR r_day IN
        SELECT id, day_number, name
        FROM program_days
        WHERE workout_program_version_id = p_source_version_id
            AND deleted_at IS NULL
        ORDER BY day_number
    LOOP
        INSERT INTO program_days (
            workout_program_id, workout_program_version_id, day_number, name,
            added_by_user_id, visibility
        ) VALUES (
            v_program_id, v_version_id, r_day.day_number, r_day.name, p_user_id, 'private'
        ) RETURNING id INTO v_day_id;

        FOR r_session IN
            SELECT id, name
            FROM program_day_sessions
            WHERE workout_program_day_id = r_day.id
                AND deleted_at IS NULL
            ORDER BY created_at
        LOOP
            -- Sessions are listed by created_at; clock_timestamp() (unlike
            -- NOW(), fixed for the transaction) keeps the source order.
            INSERT INTO program_day_sessions (
                workout_program_day_id, workout_program_version_id, name,
                added_by_user_id, visibility, created_at
            ) VALUES (
                v_day_id, v_version_id, r_session.name, p_user_id, 'private', clock_timestamp()
            ) RETURNING id INTO v_session_id;

            INSERT INTO workout_program_exercises (
                workout_program_day_session_id, workout_program_version_id, exercise_id,
                exercise_order, target_sets, min_reps, max_reps, target_rir,
                rest_seconds, tempo, notes, added_by_user_id, visibility
            )
            SELECT
                v_session_id, v_version_id, wpe.exercise_id,
                wpe.exercise_order, wpe.target_sets, wpe.min_reps, wpe.max_reps, wpe.target_rir,
                wpe.rest_seconds, wpe.tempo, wpe.notes, p_user_id, 'private'
            FROM workout_program_exercises wpe
            WHERE wpe.workout_program_day_session_id = r_session.id
                AND wpe.deleted_at IS NULL;
        END LOOP;
    END LOOP;

    RETURN v_version_id;
END;
$$;

-- Backfill: every existing selection of an admin-authored version gets its
-- own copy and is repointed at it. Logged sets keep referencing the admin
-- rows they were logged against, so workout history is unaffected; the
-- "current day/session" pointers are carried over by day number + name.
DO $$
DECLARE
    r RECORD;
    v_new_version_id UUID;
BEGIN
    FOR r IN
        SELECT upa.id, upa.user_id, upa.workout_program_version_id,
               upa.current_program_day_id, upa.current_program_day_session_id
        FROM user_program_assignments upa
        INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
        WHERE upa.deleted_at IS NULL
            AND wpv.added_by_user_id IS NULL
    LOOP
        v_new_version_id := fork_workout_program_version(r.workout_program_version_id, r.user_id, NULL);

        UPDATE user_program_assignments
        SET workout_program_version_id = v_new_version_id,
            current_program_day_id = (
                SELECT nd.id
                FROM program_days od
                INNER JOIN program_days nd
                    ON nd.workout_program_version_id = v_new_version_id
                    AND nd.day_number = od.day_number
                    AND nd.deleted_at IS NULL
                WHERE od.id = r.current_program_day_id
            ),
            current_program_day_session_id = (
                SELECT ns.id
                FROM program_day_sessions os
                INNER JOIN program_days od ON od.id = os.workout_program_day_id
                INNER JOIN program_days nd
                    ON nd.workout_program_version_id = v_new_version_id
                    AND nd.day_number = od.day_number
                    AND nd.deleted_at IS NULL
                INNER JOIN program_day_sessions ns
                    ON ns.workout_program_day_id = nd.id
                    AND ns.name = os.name
                    AND ns.deleted_at IS NULL
                WHERE os.id = r.current_program_day_session_id
                LIMIT 1
            )
        WHERE id = r.id;
    END LOOP;
END $$;
