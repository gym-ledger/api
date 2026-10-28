-- How well the target muscle contracted on a set, as the lifter felt it:
-- 0 = felt nothing, 1 (barely) .. 5 (excellent). Optional. One score covers a
-- main set and its drop sets, so it's only stored on main rows; warmups are
-- never scored. Read by the weekly check-in (algorithms/weekly-checkin.md §3).
ALTER TABLE workout_sets
ADD COLUMN IF NOT EXISTS contraction SMALLINT;

ALTER TABLE workout_sets
ADD CONSTRAINT chk_workout_sets_contraction
    CHECK (
        contraction IS NULL
        OR (contraction BETWEEN 0 AND 5 AND parent_set_id IS NULL AND is_warmup = FALSE)
    );
