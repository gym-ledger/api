import { pg } from "../../infrastructure/postgres/index.js";

export const fetchPaginatedResultsFromTable = async ({
    table,
    filter,
    select,
    sortBy,
    useSoftDelete = true,
    limit = 10,
    page = 1,
}: {
    table: string;
    filter?: Record<string, unknown>;
    select?: string[];
    sortBy?: Record<string, "asc" | "desc">;
    useSoftDelete?: boolean;
    limit?: number;
    page?: number;
}): Promise<{
    data: unknown[];
    meta: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
    };
}> => {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const offset = (page - 1) * limit;

    Object.entries(filter ?? {}).forEach(
        ([key, value], index) => {
            values.push(value);

            conditions.push(
                `${key} = $${index + 1}`
            );
        }
    );

    if (useSoftDelete) {
        conditions.push("deleted_at IS NULL");
    }

    const selectClause = select ? `SELECT ${select.join(", ")}` : "SELECT *";

    const sortByClause = sortBy ? `ORDER BY ${Object.entries(sortBy).map(([key, value]) => `${key} ${value}`).join(", ")}` : "";

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const query = `
      ${selectClause}
      FROM ${table}
      ${whereClause}
      ${sortByClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    try {
        const result =
            await pg.query(query, values);

        const rows = result.rows;

        const totalCountResult = await pg.query(`SELECT COUNT(*) FROM ${table} ${whereClause}`);
        const totalCount = Number(totalCountResult.rows[0].count);

        const lastPage = Math.ceil(totalCount / limit);

        return {
            data: rows,
            meta: {
                page,
                limit,
                totalCount: totalCount,
                totalPages: lastPage,
            }
        }
    } catch (error) {
        console.log(query);
        console.log(error);
        throw error;
    }
}

export const fetchManyFromTable = async ({
    table,
    filter,
    select,
    sortBy,
    useSoftDelete = true,
    limit,
    offset,
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
        ([key, value], index) => {
            values.push(value);

            conditions.push(
                `${key} = $${index + 1}`
            );
        }
    );

    if (useSoftDelete) {
        conditions.push("deleted_at IS NULL");
    }

    const selectClause = select ? `SELECT ${select.join(", ")}` : "SELECT *";

    const sortByClause = sortBy ? `ORDER BY ${Object.entries(sortBy).map(([key, value]) => `${key} ${value}`).join(", ")}` : "";

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const query = `
      ${selectClause}
      FROM ${table}
      ${whereClause}
      ${sortByClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    try {
        const result =
            await pg.query(query, values);

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
    filter?: Record<string, unknown>;
    select?: string[];
    sortBy?: Record<string, "asc" | "desc">;
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

    if (useSoftDelete) {
        conditions.push("deleted_at IS NULL");
    }

    const selectClause = select ? `SELECT ${select.join(", ")}` : "SELECT *";

    const sortByClause = sortBy ? `ORDER BY ${Object.entries(sortBy).map(([key, value]) => `${key} ${value}`).join(", ")}` : "";

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const query = `
      ${selectClause}
      FROM ${table}
      ${whereClause}
      ${sortByClause}
    `;
    try {
        const result =
            await pg.query(query, values);

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