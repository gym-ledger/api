import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

type RequestSchemas = {
    params?: z.ZodType;
    query?: z.ZodType;
    body?: z.ZodType;
};

/** No query string, or no body: anything sent is rejected. */
export const noInput = z.strictObject({});

/**
 * Checks a route's params, query and body against zod schemas (security
 * audit S-13) and replaces them with the parsed values, so handlers only
 * ever see known, typed, bounded fields. Schemas are strict objects: an
 * unknown field is a 400, which also rules out mass assignment. A failed
 * check throws a ZodError, which errorHandler turns into a 400.
 *
 * Every route declares `query` and `body` (`noInput` when it takes none), so
 * nothing reaches a handler unchecked.
 */
export const validate = (schemas: RequestSchemas & { query: z.ZodType, body: z.ZodType }) =>
    (req: Request, _res: Response, next: NextFunction) => {
        if (schemas.params) {
            req.params = schemas.params.parse(req.params) as Request["params"];
        }
        // req.query is a getter in Express 5; shadow it with the parsed value.
        Object.defineProperty(req, "query", {
            value: schemas.query.parse(req.query ?? {}),
            writable: true,
            configurable: true,
            enumerable: true,
        });
        req.body = schemas.body.parse(req.body ?? {});
        next();
    };

/** Path params that are all UUIDs, e.g. `uuidParams("assignmentId", "dayId")`. */
export const uuidParams = <K extends string>(...names: K[]) =>
    z.strictObject(Object.fromEntries(names.map((name) => [name, z.uuid()])) as Record<K, z.ZodUUID>);

/** A string from the query or a body, trimmed, with a length cap. */
export const text = (max: number) => z.string().trim().max(max);

/** A whole number sent as a query-string value. */
export const queryInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** `page` + `limit` query params; `limit` is capped (S-14). */
export const pagination = (maxLimit = 100) => ({
    page: queryInt(1, 100_000).optional(),
    limit: queryInt(1, maxLimit).optional(),
});

/** "true"/"false" in a query string. */
export const queryBoolean = z.enum(["true", "false"]).transform((v) => v === "true");

/** YYYY-MM-DD. */
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date as YYYY-MM-DD");
