import { pg } from "../../../infrastructure/postgres/index.js";
import { API_REQUEST_ISSUES_TABLE } from "../../../infrastructure/metrics/requestIssueLog.js";

/** Inclusive UTC day range, as YYYY-MM-DD. */
export interface DayRange {
    from: string;
    to: string;
}

export interface IssueFilters extends DayRange {
    kind?: "error" | "slow";
    statusClass?: "4xx" | "5xx";
    statusCode?: number;
    errorType?: string;
    route?: string;
    userId?: string;
}

/** WHERE clause + params shared by the list and summary queries. */
const buildWhere = (filters: IssueFilters) => {
    const where = [
        `created_at >= $1::date`,
        `created_at < ($2::date + INTERVAL '1 day')`,
    ];
    const params: unknown[] = [filters.from, filters.to];
    const add = (clause: string, value: unknown) => {
        params.push(value);
        where.push(clause.replace("?", `$${params.length}`));
    };
    if (filters.kind === "error") where.push(`is_error`);
    if (filters.kind === "slow") where.push(`is_slow`);
    if (filters.statusClass === "4xx") where.push(`status_code BETWEEN 400 AND 499`);
    if (filters.statusClass === "5xx") where.push(`status_code >= 500`);
    if (filters.statusCode !== undefined) add(`status_code = ?`, filters.statusCode);
    if (filters.errorType) add(`error_type = ?`, filters.errorType);
    if (filters.route) add(`route = ?`, filters.route);
    if (filters.userId) add(`user_id = ?`, filters.userId);
    return { where: where.join(" AND "), params };
}

export const fetchIssuesRepository = async (filters: IssueFilters, page: number, limit: number) => {
    const { where, params } = buildWhere(filters);
    const [rows, count] = await Promise.all([
        pg.query(`
        SELECT id, created_at, request_id, method, route, path, status_code, duration_ms,
               is_error, is_slow, error_type, error_message, user_id, admin_user_id
        FROM ${API_REQUEST_ISSUES_TABLE}
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, (page - 1) * limit]),
        pg.query(`SELECT COUNT(*)::int AS total FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where}`, params),
    ]);
    return { rows: rows.rows, totalCount: count.rows[0].total as number };
}

export const fetchIssueRepository = async (id: string) => {
    const result = await pg.query(`
    SELECT i.*,
           u.first_name AS user_first_name, u.last_name AS user_last_name,
           a.email AS admin_email
    FROM ${API_REQUEST_ISSUES_TABLE} i
    LEFT JOIN users u ON u.id = i.user_id
    LEFT JOIN admin_users a ON a.id = i.admin_user_id
    WHERE i.id = $1
    `, [id]);
    return result.rows[0] ?? null;
}

/** Totals and breakdowns for the summary cards, over the same filters as the list. */
export const fetchIssueSummaryRepository = async (filters: IssueFilters) => {
    const { where, params } = buildWhere(filters);
    const [totals, byStatus, byType, byRoute, perDay] = await Promise.all([
        pg.query(`
        SELECT COUNT(*) FILTER (WHERE is_error)::int AS errors,
               COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
               COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS client_errors,
               COUNT(*) FILTER (WHERE is_slow)::int AS slow,
               COUNT(DISTINCT user_id)::int AS users_affected
        FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where}
        `, params),
        pg.query(`
        SELECT status_code, COUNT(*)::int AS count
        FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where} AND is_error
        GROUP BY status_code ORDER BY count DESC
        `, params),
        pg.query(`
        SELECT error_type, COUNT(*)::int AS count
        FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where} AND is_error
        GROUP BY error_type ORDER BY count DESC LIMIT 20
        `, params),
        pg.query(`
        SELECT method, route,
               COUNT(*) FILTER (WHERE is_error)::int AS errors,
               COUNT(*) FILTER (WHERE is_slow)::int AS slow,
               MAX(duration_ms)::int AS max_duration_ms
        FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where}
        GROUP BY method, route ORDER BY COUNT(*) DESC LIMIT 15
        `, params),
        pg.query(`
        WITH f AS (
            SELECT created_at, status_code, is_slow FROM ${API_REQUEST_ISSUES_TABLE} WHERE ${where}
        )
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
               COUNT(f.created_at) FILTER (WHERE f.status_code BETWEEN 400 AND 499)::int AS client_errors,
               COUNT(f.created_at) FILTER (WHERE f.status_code >= 500)::int AS server_errors,
               COUNT(f.created_at) FILTER (WHERE f.is_slow)::int AS slow
        FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
        LEFT JOIN f ON f.created_at >= d AND f.created_at < d + INTERVAL '1 day'
        GROUP BY d ORDER BY d
        `, params),
    ]);
    return {
        totals: totals.rows[0],
        byStatus: byStatus.rows,
        byErrorType: byType.rows,
        byRoute: byRoute.rows,
        perDay: perDay.rows,
    };
}

/** Distinct values for the filter dropdowns, from the last `days` days. */
export const fetchIssueFacetsRepository = async (from: string, to: string) => {
    const [routes, types] = await Promise.all([
        pg.query(`
        SELECT DISTINCT route FROM ${API_REQUEST_ISSUES_TABLE}
        WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
        ORDER BY route LIMIT 500
        `, [from, to]),
        pg.query(`
        SELECT DISTINCT error_type FROM ${API_REQUEST_ISSUES_TABLE}
        WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND error_type IS NOT NULL
        ORDER BY error_type
        `, [from, to]),
    ]);
    return {
        routes: routes.rows.map((r) => r.route as string),
        errorTypes: types.rows.map((r) => r.error_type as string),
    };
}
