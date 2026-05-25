import { pg } from "../../infrastructure/postgres/index.js";

export const allowedTables = [
    "exercises",
    "admin_users",
    "admin_sessions",
    "otp_auth",
    "users",
    "user_weight_entries",
    "user_weight_moving_averages",
    "user_weight_views",
    "workout_programs",
    "workout_program_days",
    "workout_program_day_exercises"
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

    /**
     * IMPORTANT:
     * Whitelist tables in production.
     */

    if (!allowedTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
    }

    const values: unknown[] = [];

    const conditions: string[] = [];

    const computedExtraSelects: string[] = [
        ...extraSelects,
    ];

    const offset = (page - 1) * limit;

    /**
     * WHERE conditions
     */
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

    /**
     * Soft delete support
     */
    if (useSoftDelete) {
        conditions.push(
            `deleted_at IS NULL`
        );
    }

    /**
     * SELECT clause
     */
    const selectFields = [
        ...(select ?? ["*"]),
        ...computedExtraSelects,
    ];

    const selectClause =
        `SELECT ${selectFields.join(", ")}`;

    /**
     * WHERE clause
     */
    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

    /**
     * ORDER BY clause
     *
     * IMPORTANT:
     * Whitelist sortable fields in production.
     */
    let sortByClause = "";

    if (sortBy) {
        const sortEntries =
            Object.entries(sortBy);

        if (sortEntries.length > 0) {
            sortByClause = `
                ORDER BY
                ${sortEntries
                    .map(
                        ([field, direction]) =>
                            `${field} ${direction.toUpperCase()}`
                    )
                    .join(", ")}
            `;
        }
    }

    /**
     * Pagination
     */
    values.push(limit);

    const limitPlaceholder =
        `$${values.length}`;

    values.push(offset);

    const offsetPlaceholder =
        `$${values.length}`;

    /**
     * Main query
     */
    const query = `
        ${selectClause}
        FROM ${table}
        ${whereClause}
        ${sortByClause}
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
    `;

    /**
     * Count query
     */
    const countQuery = `
        SELECT COUNT(*) AS total_count
        FROM ${table}
        ${whereClause}
    `;

    try {
        const [rowsResult, countResult] =
            await Promise.all([
                pg.query(query, values),

                pg.query(
                    countQuery,
                    values.slice(0, values.length - 2)
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

                totalPages:
                    Math.ceil(totalCount / limit),
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
    filter,
    select,
    sortBy,
    useSoftDelete = true,
    limit,
    offset = 0,
}: {
    table: string;
    filter?: Record<string, unknown>;
    select?: string[];
    sortBy?: Record<string, "asc" | "desc">;
    useSoftDelete?: boolean;
    limit?: number;
    offset?: number;
}): Promise<unknown[]> => {
    const values: unknown[] = [];

    const conditions: string[] = [];

    Object.entries(filter ?? {}).forEach(
        ([key, rawValue]) => {
            let operator = "=";

            let value = rawValue;

            if (
                typeof rawValue === "object"
                && rawValue !== null
                && "operator" in rawValue
                && "value" in rawValue
            ) {
                operator = rawValue.operator as "=" | "!=";

                value = rawValue.value;
            }

            values.push(value);

            conditions.push(
                `${key} ${operator} $${values.length
                }`
            );
        }
    );

    if (useSoftDelete) {
        conditions.push(
            "deleted_at IS NULL"
        );
    }

    const selectClause = select
        ? `SELECT ${select.join(", ")}`
        : "SELECT *";

    const sortByClause = sortBy
        ? `ORDER BY ${Object.entries(
            sortBy
        )
            .map(
                ([key, value]) =>
                    `${key} ${value}`
            )
            .join(", ")}`
        : "";

    const whereClause =
        conditions.length
            ? `WHERE ${conditions.join(
                " AND "
            )}`
            : "";

    const query = `
        ${selectClause}
        FROM ${table}
        ${whereClause}
        ${sortByClause}
        ${limit ? `LIMIT ${limit}` : ""}
        ${offset ? `OFFSET ${offset}` : ""}
    `;

    try {
        const result = await pg.query(
            query,
            values
        );

        return result.rows;
    } catch (error) {
        console.log(query);

        console.log(error);

        throw error;
    }
}

export const fetchOneFromTable = async ({
    table,
    filter,
    select,
    sortBy,
    useSoftDelete = true,
}: {
    table: string;
    filter?: IFilter;
    select?: string[];
    sortBy?: Record<string, "asc" | "desc">;
    useSoftDelete?: boolean;
}): Promise<unknown> => {
    const values: unknown[] = [];

    const conditions: string[] = [];

    Object.entries(filter ?? {}).forEach(
        ([key, rawValue]) => {
            let operator = "=";

            let value = rawValue;

            if (
                typeof rawValue === "object"
                && rawValue !== null
                && "operator" in rawValue
                && "value" in rawValue
            ) {
                operator = rawValue.operator as "=" | "!=";

                value = rawValue.value;
            }

            values.push(value);

            conditions.push(
                `${key} ${operator} $${values.length
                }`
            );
        }
    );

    if (useSoftDelete) {
        conditions.push(
            "deleted_at IS NULL"
        );
    }

    const selectClause = select
        ? `SELECT ${select.join(", ")}`
        : "SELECT *";

    const sortByClause = sortBy
        ? `ORDER BY ${Object.entries(
            sortBy
        )
            .map(
                ([key, value]) =>
                    `${key} ${value}`
            )
            .join(", ")}`
        : "";

    const whereClause =
        conditions.length
            ? `WHERE ${conditions.join(
                " AND "
            )}`
            : "";

    const query = `
        ${selectClause}
        FROM ${table}
        ${whereClause}
        ${sortByClause}
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

        console.log(error);

        throw error;
    }

}

export const addOneInTable = async ({
    table,
    data,
}: {
    table: string;
    data: Record<string, unknown>;
}): Promise<unknown> => {
    // in insert use $1, $2, $3, ... instead of 'value'
    const values = Object.values(data).map((value, index) => typeof value === "undefined" || value === null ? null : typeof value === "string" ? `${value}` : value instanceof Date ? `${(value as Date).toISOString()}` : value);
    const query = `INSERT INTO ${table} (${Object.keys(data).join(", ")}) VALUES (${values.map((value, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
    try {
        const result = await pg.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.log(query);
        console.log(values);
        console.log(error);
        throw error;
    }
}

export const updateOneInTable = async ({
    table,
    data,
    filter,
}: {
    table: string;
    data: Record<string, unknown>;
    filter?: Record<string, unknown>;
}): Promise<unknown> => {

    const values: unknown[] = [];
    const conditions: string[] = [];

    // WHERE clause
    Object.entries(filter ?? {}).forEach(
        ([key, value], index) => {
            values.push(value);

            conditions.push(
                `${key} = $${index + 1}`
            );
        }
    );

    // SET clause
    const setClause = Object.keys(data)
        .map((key, index) =>
            `${key} = $${values.length + index + 1}`
        )
        .join(", ");

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const query = `
        UPDATE ${table}
        SET ${setClause}
        ${whereClause}
        RETURNING *
    `;

    try {
        const result = await pg.query(
            query,
            [...values, ...Object.values(data)]
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
    filter,
    useSoftDelete = true,
}: {
    table: string;
    filter?: Record<string, unknown>;
    useSoftDelete?: boolean;
}): Promise<unknown> => {
    const values: unknown[] = [];
    const conditions: string[] = [];

    Object.entries(filter ?? {}).forEach(
        ([key, value], index) => {
            values.push(value);

            conditions.push(
                `${key} = $${index + 1}`
            );
        }
    );
    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}` : "";

    if (useSoftDelete) {

        const query = `UPDATE ${table} SET deleted_at = NOW() ${whereClause} RETURNING *`;
        const result = await pg.query(query, values);
        return result.rows[0];
    } else {
        const query = `DELETE FROM ${table} ${whereClause} RETURNING *`;
        const result = await pg.query(query, values);
        return result.rows[0];
    }
}