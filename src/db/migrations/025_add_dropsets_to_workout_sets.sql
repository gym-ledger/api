ALTER TABLE workout_sets
ADD COLUMN IF NOT EXISTS parent_set_id UUID REFERENCES workout_sets(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS drop_order INT;

ALTER TABLE workout_sets
ADD CONSTRAINT chk_workout_sets_drop_order
    CHECK (drop_order IS NULL OR (drop_order BETWEEN 1 AND 10));

ALTER TABLE workout_sets
ADD CONSTRAINT chk_workout_sets_drop_pairing
    CHECK ((parent_set_id IS NULL) = (drop_order IS NULL));

CREATE INDEX IF NOT EXISTS idx_workout_sets_parent_set_id
    ON workout_sets(parent_set_id)
    WHERE parent_set_id IS NOT NULL;
