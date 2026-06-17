import { pg } from "../../infrastructure/postgres/index.js";

export const allowedTables = [
    "admin_users",
    "exercises",
    "otp_auth",
    "program_day_sessions",
    "program_days",
    "progression_rules",
    "schema_migrations",
    "user_health_preferences",
    "user_program_assignments",
    "user_sessions",
    "user_weight_entries",
    "user_weight_moving_averages",
    "user_weight_views",
    "users",
    "workout_program_exercises",
    "workout_program_versions",
    "workout_programs",
    "workout_sessions",
    "workout_sets",
];
export type IFilter = Record<
    string,
    | unknown
    | {
        operator: "=" | "!=";
        value: unknown;
    }
>

export type QueryOperator =
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "ILIKE"
    | "IN"
    | "IS NULL"
    | "RAW"
    | "FTS";

export type QueryCondition = {
    field?: string;
    operator: QueryOperator;
    value?: unknown;
    raw?: string;
};

export type FetchPaginatedResultsFromTableParams = {
    table: string;

    where?: QueryCondition[];

    select?: string[];

    extraSelects?: string[];

    sortBy?: Record<string, "asc" | "desc">;

    useSoftDelete?: boolean;

    limit?: number;

    page?: number;
};

export type FetchManyFromTableParams = {
    table: string;
    where?: QueryCondition[];
    select?: string[];
    extraSelects?: string[];
    sortBy?: Record<string, "asc" | "desc">;
    useSoftDelete?: boolean;
    limit?: number;
    offset?: number;
};
type BuildWhereClauseResult = {
    whereClause: string;
    values: unknown[];
    extraSelects: string[];
    sortBy?: Record<string, "asc" | "desc">;
};

export const buildWhereClause = (
    where: QueryCondition[] = [],
    initialSortBy?: Record<string, "asc" | "desc">
): BuildWhereClauseResult => {

    const values: unknown[] = [];
    const conditions: string[] = [];
    const extraSelects: string[] = [];

    let sortBy = initialSortBy;

    for (const condition of where) {

        switch (condition.operator) {

            case "=":
            case "!=":
            case ">":
            case "<":
            case ">=":
            case "<=":
            case "ILIKE": {

                values.push(condition.value);

                conditions.push(
                    `${condition.field} ${condition.operator} $${values.length}`
                );

                break;
            }

            case "IN": {

                if (
                    !Array.isArray(condition.value)
                    || condition.value.length === 0
                ) {
                    break;
                }

                const placeholders = condition.value.map(v => {
                    values.push(v);

                    return `$${values.length}`;
                });

                conditions.push(
                    `${condition.field} IN (${placeholders.join(", ")})`
                );

                break;
            }

            case "IS NULL": {

                conditions.push(
                    `${condition.field} IS NULL`
                );

                break;
            }

            case "RAW": {

                if (condition.raw) {
                    conditions.push(condition.raw);
                }

                break;
            }

            case "FTS": {

                if (
                    typeof condition.value !== "string"
                    || !condition.value.trim()
                ) {
                    break;
                }

                values.push(condition.value);

                const placeholder = `$${values.length}`;

                conditions.push(`
                    search_vector
                    @@ websearch_to_tsquery(
                        'english',
                        ${placeholder}
                    )
                `);

                extraSelects.push(`
                    ts_rank(
                        search_vector,
                        websearch_to_tsquery(
                            'english',
                            ${placeholder}
                        )
                    ) AS rank
                `);

                sortBy ??= {
                    rank: "desc",
                };

                break;
            }

            default:
                throw new Error(
                    `Unsupported operator: ${condition.operator}`
                );
        }
    }

    return {
        values,
        extraSelects,
        sortBy,
        whereClause:
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "",
    };
};

export const buildOrderByClause = (
    sortBy?: Record<string, "asc" | "desc">
) => {

    if (!sortBy) {
        return "";
    }

    const entries = Object.entries(sortBy);

    if (!entries.length) {
        return "";
    }

    return `
        ORDER BY
        ${entries
            .map(
                ([field, dir]) =>
                    `${field} ${dir.toUpperCase()}`
            )
            .join(", ")}
    `;
};

export const buildSelectClause = (
    select?: string[],
    extraSelects: string[] = []
) => {

    return `
        SELECT
        ${[
            ...(select ?? ["*"]),
            ...extraSelects,
        ].join(", ")}
    `;
};

export const fetchPaginatedResultsFromTable = async ({
    table,
    where = [],
    select,
    extraSelects = [],
    sortBy,
    useSoftDelete = true,
    limit = 10,
    page = 1,
}: FetchPaginatedResultsFromTableParams): Promise<{
    data: unknown[];
    meta: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
    };
}> => {

    page = parseInt(page.toString());
    limit = parseInt(limit.toString());

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    const offset = (page - 1) * limit;

    let {
        values,
        whereClause,
        extraSelects: computedExtraSelects,
        sortBy: computedSortBy,
    } = buildWhereClause(where, sortBy);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;
    }

    const selectClause = buildSelectClause(
        select,
        [
            ...extraSelects,
            ...computedExtraSelects,
        ]
    );

    const sortByClause =
        buildOrderByClause(computedSortBy);

    values.push(limit);
    const limitPlaceholder = `$${values.length}`;

    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const query = `
        ${selectClause}
        FROM ${table}
        ${whereClause}
        ${sortByClause}
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
    `;

    const countQuery = `
        SELECT COUNT(*) AS total_count
        FROM ${table}
        ${whereClause}
    `;

    try {

        const [rowsResult, countResult] =
            await Promise.all([
                pg.query(
                    query,
                    values
                ),

                pg.query(
                    countQuery,
                    values.slice(
                        0,
                        values.length - 2
                    )
                ),
            ]);

        const totalCount = Number(
            countResult.rows[0].total_count
        );

        return {
            data: rowsResult.rows,

            meta: {
                page,
                limit,
                totalCount,

                totalPages: Math.ceil(
                    totalCount / limit
                ),
            },
        };

    } catch (error) {

        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

export const fetchManyFromTable = async ({
    table,
    where = [],
    select,
    extraSelects = [],
    sortBy,
    useSoftDelete = true,
    limit,
    offset = 0,
}: FetchManyFromTableParams): Promise<unknown[]> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    offset = parseInt(offset.toString());

    if (limit) {
        limit = parseInt(limit.toString());
    }

    let {
        values,
        whereClause,
        extraSelects: computedExtraSelects,
        sortBy: computedSortBy,
    } = buildWhereClause(where, sortBy);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;
    }

    const query = `
        ${buildSelectClause(
        select,
        [
            ...extraSelects,
            ...computedExtraSelects,
        ]
    )}
        FROM ${table}
        ${whereClause}
        ${buildOrderByClause(computedSortBy)}
        ${limit ? `LIMIT ${limit}` : ""}
        ${offset ? `OFFSET ${offset}` : ""}
    `;

    try {
        const rowsResult = await pg.query(
            query,
            values
        );

        return rowsResult.rows;

    } catch (error) {
        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

const handleWhereConditions = (where: QueryCondition[], values: unknown[], conditions: string[], sortBy: Record<string, "asc" | "desc"> = {}, computedExtraSelects: string[] = []) => {

    where.forEach((condition) => {
        switch (condition.operator) {
            case "=": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} = $${values.length}`
                );

                break;
            }

            case "!=": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} != $${values.length}`
                );

                break;
            }

            case ">": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} > $${values.length}`
                );

                break;
            }

            case "<": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} < $${values.length}`
                );

                break;
            }

            case ">=": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} >= $${values.length}`
                );

                break;
            }

            case "<=": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} <= $${values.length}`
                );

                break;
            }

            case "ILIKE": {
                values.push(condition.value);

                conditions.push(
                    `${condition.field} ILIKE $${values.length}`
                );

                break;
            }

            case "IN": {
                if (
                    !Array.isArray(condition.value)
                    || condition.value.length === 0
                ) {
                    break;
                }

                const placeholders = condition.value.map((value) => {
                    values.push(value);

                    return `$${values.length}`;
                });

                conditions.push(
                    `${condition.field} IN (${placeholders.join(", ")})`
                );

                break;
            }

            case "IS NULL": {
                conditions.push(
                    `${condition.field} IS NULL`
                );

                break;
            }

            case "FTS": {
                if (
                    !condition.value
                    || typeof condition.value !== "string"
                    || condition.value.trim() === ""
                ) {
                    break;
                }

                values.push(condition.value);

                const placeholder =
                    `$${values.length}`;

                conditions.push(`
                    search_vector
                    @@
                    websearch_to_tsquery(
                        'english',
                        ${placeholder}
                    )
                `);

                computedExtraSelects.push(`
                    ts_rank(
                        search_vector,
                        websearch_to_tsquery(
                            'english',
                            ${placeholder}
                        )
                    ) AS rank
                `);

                /**
                 * Automatically sort by rank
                 * unless explicitly overridden
                 */
                if (!sortBy) {
                    sortBy = {
                        rank: "desc",
                    };
                }

                break;
            }

            case "RAW": {
                if (!condition.raw) {
                    break;
                }

                conditions.push(condition.raw);

                break;
            }

            default: {
                throw new Error(
                    `Unsupported operator: ${condition.operator}`
                );
            }
        }
    });
    return { values, conditions, computedExtraSelects, sortBy };
}
export const fetchOneFromTable = async ({
    table,
    where = [],
    filter,
    select,
    sortBy,
    useSoftDelete = true,
}: {
    table: string;
    where?: QueryCondition[];
    filter?: Record<string, unknown>;
    select?: string[];
    sortBy?: Record<string, "asc" | "desc">;
    useSoftDelete?: boolean;
}): Promise<unknown> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    const filterConditions: QueryCondition[] = Object.entries(filter ?? {}).map(([field, value]) => ({
        field,
        operator: "=" as const,
        value,
    }));

    let {
        values,
        whereClause,
        extraSelects: computedExtraSelects,
        sortBy: computedSortBy,
    } = buildWhereClause([...filterConditions, ...where], sortBy);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;
    }

    const query = `
        ${buildSelectClause(
        select,
        computedExtraSelects
    )}
        FROM ${table}
        ${whereClause}
        ${buildOrderByClause(computedSortBy)}
        LIMIT 1
    `;

    try {

        const result = await pg.query(
            query,
            values
        );

        return result.rows[0];

    } catch (error) {

        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

export const addOneInTable = async ({
    table,
    data,
}: {
    table: string;
    data: Record<string, unknown>;
}): Promise<unknown> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    const keys = Object.keys(data);

    if (keys.length === 0) {
        throw new Error(
            "Cannot insert empty data object"
        );
    }

    const values = Object.values(data).map(
        (value) => {

            if (
                value === undefined
                || value === null
            ) {
                return null;
            }

            if (value instanceof Date) {
                return value.toISOString();
            }

            return value;
        }
    );

    const placeholders = values.map(
        (_, index) => `$${index + 1}`
    );

    const query = `
        INSERT INTO ${table}
        (${keys.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING *
    `;

    try {

        const result = await pg.query(
            query,
            values
        );

        return result.rows[0];

    } catch (error) {

        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

export const updateOneInTable = async ({
    table,
    data,
    where = [],
    filter,
    useSoftDelete = true,
}: {
    table: string;
    data: Record<string, unknown>;
    where?: QueryCondition[];
    filter?: Record<string, unknown>;
    useSoftDelete?: boolean;
}): Promise<unknown> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    const filterConditions: QueryCondition[] = Object.entries(filter ?? {}).map(([field, value]) => ({
        field,
        operator: "=" as const,
        value,
    }));

    let {
        values,
        whereClause,
    } = buildWhereClause([...filterConditions, ...where]);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;
    }

    const dataValues = Object.values(data);

    const setClause = Object.keys(data)
        .map(
            (key, index) =>
                `${key} = $${values.length + index + 1}`
        )
        .join(", ");

    const query = `
        UPDATE ${table}
        SET ${setClause}
        ${whereClause}
        RETURNING *
    `;

    try {

        const result = await pg.query(
            query,
            [
                ...values,
                ...dataValues,
            ]
        );

        return result.rows[0];

    } catch (error) {

        console.log(data);
        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

export const deleteOneFromTable = async ({
    table,
    where = [],
    useSoftDelete = true,
}: {
    table: string;
    where?: QueryCondition[];
    useSoftDelete?: boolean;
}): Promise<unknown> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    let {
        values,
        whereClause,
    } = buildWhereClause(where);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;

        const query = `
            UPDATE ${table}
            SET deleted_at = NOW()
            ${whereClause}
            RETURNING *
        `;

        try {

            const result = await pg.query(
                query,
                values
            );

            return result.rows[0];

        } catch (error) {

            console.log(query);
            console.log(values);
            console.log(error);

            throw error;
        }

    } else {

        const query = `
            DELETE FROM ${table}
            ${whereClause}
            RETURNING *
        `;

        try {

            const result = await pg.query(
                query,
                values
            );

            return result.rows[0];

        } catch (error) {

            console.log(query);
            console.log(values);
            console.log(error);

            throw error;
        }
    }
};
export const addManyInTable = async ({
    table,
    data,
}: {
    table: string;
    data: Record<string, unknown>[];
}): Promise<unknown[]> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    if (data.length === 0) {
        return [];
    }

    const keys = Object.keys(data[0]);

    if (keys.length === 0) {
        throw new Error(
            "Cannot insert empty data objects"
        );
    }

    const values: unknown[] = [];

    const rowPlaceholders = data.map((row, rowIndex) => {

        const placeholders = keys.map((key, colIndex) => {

            const value = row[key];

            values.push(
                value === undefined || value === null
                    ? null
                    : value instanceof Date
                        ? value.toISOString()
                        : value
            );

            return `$${rowIndex * keys.length + colIndex + 1}`;
        });

        return `(${placeholders.join(", ")})`;
    });

    const query = `
        INSERT INTO ${table}
        (${keys.join(", ")})
        VALUES
        ${rowPlaceholders.join(", ")}
        RETURNING *
    `;

    try {

        const result = await pg.query(
            query,
            values
        );

        return result.rows;

    } catch (error) {

        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};

export const deleteManyInTable = async ({
    table,
    where = [],
    useSoftDelete = true,
}: {
    table: string;
    where?: QueryCondition[];
    useSoftDelete?: boolean;
}): Promise<unknown[]> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    if (where.length === 0) {
        throw new Error(
            "Refusing to delete without WHERE conditions"
        );
    }

    let {
        values,
        whereClause,
    } = buildWhereClause(where);

    if (useSoftDelete) {

        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;

        const query = `
            UPDATE ${table}
            SET deleted_at = NOW()
            ${whereClause}
            RETURNING *
        `;

        try {

            const result = await pg.query(
                query,
                values
            );

            return result.rows;

        } catch (error) {

            console.log(query);
            console.log(values);
            console.log(error);

            throw error;
        }

    }

    const query = `
        DELETE FROM ${table}
        ${whereClause}
        RETURNING *
    `;

    try {

        const result = await pg.query(
            query,
            values
        );

        return result.rows;

    } catch (error) {

        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};
export const updateManyInTable = async ({
    table,
    data,
    where = [],
    useSoftDelete = true,
}: {
    table: string;
    data: Record<string, unknown>;
    where?: QueryCondition[];
    useSoftDelete?: boolean;
}): Promise<unknown[]> => {

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    if (where.length === 0) {
        throw new Error(
            "Refusing to update without WHERE conditions"
        );
    }

    if (Object.keys(data).length === 0) {
        throw new Error(
            "No fields provided for update"
        );
    }

    let {
        values,
        whereClause,
    } = buildWhereClause(where);

    if (useSoftDelete) {
        whereClause = whereClause
            ? `${whereClause} AND deleted_at IS NULL`
            : `WHERE deleted_at IS NULL`;
    }

    const dataValues = Object.values(data);

    const setClause = Object.keys(data)
        .map(
            (key, index) =>
                `${key} = $${values.length + index + 1}`
        )
        .join(", ");

    const query = `
        UPDATE ${table}
        SET ${setClause}
        ${whereClause}
        RETURNING *
    `;

    try {

        const result = await pg.query(
            query,
            [
                ...values,
                ...dataValues,
            ]
        );

        return result.rows;

    } catch (error) {

        console.log(data);
        console.log(query);
        console.log(values);
        console.log(error);

        throw error;
    }
};