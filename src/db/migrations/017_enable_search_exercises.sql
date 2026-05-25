CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
    setweight(
        to_tsvector(
            'english',
            coalesce(name, '')
        ),
        'A'
    )
    ||
    setweight(
        to_tsvector(
            'english',
            coalesce(description, '')
        ),
        'B'
    )
) STORED;

CREATE INDEX IF NOT EXISTS idx_exercises_search_vector
ON exercises
USING GIN(search_vector)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercises_name_trgm
ON exercises
USING GIN(name gin_trgm_ops)
WHERE deleted_at IS NULL;