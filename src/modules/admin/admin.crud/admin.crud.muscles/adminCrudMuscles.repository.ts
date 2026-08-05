import { MusclesInterface } from "../../../../db/schemas/muscles/muscles.schema.js";
import { pg } from "../../../../infrastructure/postgres/index.js";
import { buildWhereClause, QueryCondition } from "../../../index/index.repository.js";

/**
 * Lists muscles as: parent, then its children ordered by display_order, then
 * the next parent, etc. Children are joined to their parent so a search that
 * only matches a child still sorts into the position its parent would occupy,
 * even though the parent row itself may be filtered out by the search term.
 *
 * Muscles have no `search_vector` column (only `exercises` does), so search
 * here uses a plain case-insensitive ILIKE on name rather than the shared
 * FTS query condition.
 */
export const fetchOrderedMusclesForAdminRepository = async (data: {
    search?: string,
    parentsOnly?: boolean,
    page?: number,
    limit?: number,
}) => {
    const {
        search = "",
        parentsOnly = false,
        page = 1,
        limit = 10,
    } = data;

    const pageNum = parseInt(page.toString(), 10) || 1;
    const limitNum = parseInt(limit.toString(), 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ["m.deleted_at IS NULL"];
    const values: unknown[] = [];

    if (parentsOnly) {
        conditions.push("m.parent_muscle_id IS NULL");
    }

    if (search.trim()) {
        values.push(`%${search.trim()}%`);
        conditions.push(`m.name ILIKE $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const fromClause = `
    FROM muscles m
    LEFT JOIN muscles p
        ON p.id = m.parent_muscle_id
        AND p.deleted_at IS NULL
    ${whereClause}
    `;

    const limitPlaceholder = `$${values.length + 1}`;
    const offsetPlaceholder = `$${values.length + 2}`;

    const query = `
    SELECT m.*
    ${fromClause}
    ORDER BY
        COALESCE(p.display_order, m.display_order) ASC,
        (m.parent_muscle_id IS NOT NULL) ASC,
        m.display_order ASC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;
    const countQuery = `
    SELECT COUNT(*) AS total_count
    ${fromClause}
    `;

    const [rowsResult, countResult] = await Promise.all([
        pg.query(query, [...values, limitNum, offset]),
        pg.query(countQuery, values),
    ]);

    const totalCount = Number(countResult.rows[0].total_count);

    return {
        data: rowsResult.rows as MusclesInterface[],
        meta: {
            page: pageNum,
            limit: limitNum,
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
        },
    };
}

export const fetchHeirarchicalMusclesForAdminRepository = async (data: { search?: string, page?: number, limit?: number }) => {
    const { search = "", page = 1, limit = 20 } = data;

    const whereParams: QueryCondition[] = [
        { field: "name", operator: "FTS", value: search }
    ];

    let {
        values,
        whereClause,
    } = buildWhereClause(whereParams);
    const offset = (page - 1) * limit;
    const query = `
    SELECT m.id, m.name, (
        SELECT ARRAY_AGG(m2.id, m2.name)
        FROM muscles m2
        WHERE m2.parent_muscle_id = m.id
    ) as childrenMuscles
    FROM muscles m
    WHERE m.parent_muscle_id IS NULL
    ${whereClause}
    LIMIT ${limit} OFFSET ${offset}
    `;
    const result = await pg.query(query, values);
    return result.rows as { id: string, name: string, childrenMuscles: { id: string, name: string }[] }[];
}

export const fetchPopulatedMusclesForExportRepository = async (data: { search?: string }) => {
    const { search = "" } = data;
    const whereParams: QueryCondition[] = [
        { field: "name", operator: "FTS", value: search }
    ];
    let {
        values,
        whereClause,
    } = buildWhereClause(whereParams);
    // [{name: String, parentMuscle: {name: String, id: String}}]
    // Return [ id, name, ]
    const query = `
    SELECT m.name, m.display_order, (
        SELECT m2.name
        FROM muscles m2
        WHERE m2.id = m.parent_muscle_id
    ) as parentMuscle
    FROM muscles m
    ${whereClause}
    ORDER BY m.display_order ASC
    `;
    const result = await pg.query(query, values);
    return result.rows as { name: string, parentMuscle: { name: string, id: string } }[];
}
