import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";

export interface UserMuscleRow {
    id: string;
    name: string;
    slug: string;
    parent_muscle_id: string | null;
    body_region: string | null;
    display_order: number;
}

/** All muscles, ordered for stable filter-chip / picker display. */
export const fetchMusclesForUserRepository = async (): Promise<UserMuscleRow[]> => {
    const query = `
    SELECT id, name, slug, parent_muscle_id, body_region, display_order
    FROM muscles
    WHERE deleted_at IS NULL
    ORDER BY display_order ASC, name ASC
    `;
    try {
        const result = await pg.query(query);
        return result.rows as UserMuscleRow[];
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch muscles", 500);
    }
}

export interface UserExerciseMuscleRow {
    id: string;
    name: string;
    slug: string;
    body_region: string | null;
    contribution: number;
}

export interface UserExerciseListRow {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
    description: string | null;
    muscles: UserExerciseMuscleRow[];
}

const MUSCLES_JSON_SELECT = `
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', m.id,
                    'name', m.name,
                    'slug', m.slug,
                    'body_region', m.body_region,
                    'contribution', em.contribution
                )
                ORDER BY em.contribution DESC
            )
            FROM exercise_muscles em
            INNER JOIN muscles m ON m.id = em.muscle_id AND m.deleted_at IS NULL
            WHERE em.exercise_id = e.id AND em.deleted_at IS NULL
        ),
        '[]'
    )
`;

/**
 * Public exercise catalog for end users — only `visibility = 'public'`
 * exercises are eligible (matches the same gate used for public workout
 * plans). `bodyRegion`, when given, restricts to exercises with at least one
 * muscle link whose `body_region` matches — this is a hand-rolled query
 * rather than the generic `fetchPaginatedResultsFromTable` helper because the
 * body-region filter needs a parameterized EXISTS join the generic `RAW`
 * operator can't safely express (it doesn't bind values).
 */
export const fetchExercisesForUserRepository = async (data: {
    search?: string,
    bodyRegion?: string,
    page: number,
    limit: number,
}): Promise<{ data: UserExerciseListRow[], totalCount: number }> => {
    const { search, bodyRegion, page, limit } = data;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const conditions: string[] = ["e.deleted_at IS NULL", "e.visibility = 'public'"];

    if (search && search.trim()) {
        params.push(search.trim());
        conditions.push(`e.search_vector @@ websearch_to_tsquery('english', $${params.length})`);
    }
    if (bodyRegion && bodyRegion.trim()) {
        params.push(bodyRegion.trim());
        conditions.push(`EXISTS (
            SELECT 1 FROM exercise_muscles em2
            INNER JOIN muscles m2 ON m2.id = em2.muscle_id AND m2.deleted_at IS NULL
            WHERE em2.exercise_id = e.id AND em2.deleted_at IS NULL AND m2.body_region = $${params.length}
        )`);
    }

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const query = `
    SELECT
        e.id,
        e.name,
        e.slug,
        e.image_url,
        e.description,
        ${MUSCLES_JSON_SELECT} AS muscles,
        COUNT(*) OVER() AS total_count
    FROM exercises e
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.name ASC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;
    try {
        const result = await pg.query(query, params);
        const totalCount = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
        return {
            data: result.rows.map((row) => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                image_url: row.image_url,
                description: row.description,
                muscles: (row.muscles ?? []).map((m: UserExerciseMuscleRow) => ({
                    ...m,
                    contribution: Number(m.contribution),
                })),
            })),
            totalCount,
        };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch exercises", 500);
    }
}

export interface UserExerciseDetailRow {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
    description: string | null;
    muscles: UserExerciseMuscleRow[];
}

/** Single public exercise with its full muscle breakdown, or null if not found / not public. */
export const fetchExerciseDetailForUserRepository = async (
    id: string,
): Promise<UserExerciseDetailRow | null> => {
    const query = `
    SELECT
        e.id,
        e.name,
        e.slug,
        e.image_url,
        e.description,
        ${MUSCLES_JSON_SELECT} AS muscles
    FROM exercises e
    WHERE e.id = $1 AND e.deleted_at IS NULL AND e.visibility = 'public'
    `;
    try {
        const result = await pg.query(query, [id]);
        const row = result.rows[0];
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            image_url: row.image_url,
            description: row.description,
            muscles: (row.muscles ?? []).map((m: UserExerciseMuscleRow) => ({
                ...m,
                contribution: Number(m.contribution),
            })),
        };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch exercise", 500);
    }
}
