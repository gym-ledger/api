import type {
    NextFunction,
    Request,
    Response,
} from "express";

import multer from "multer";
import { ZodError } from "zod";

import { logger } from "../config/logger.js";

import { AppError } from "../shared/errors/AppError.js";

/** Stable error codes by status, so responses don't expose internal class names. */
const CODE_BY_STATUS: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    429: "TOO_MANY_REQUESTS",
    503: "SERVICE_UNAVAILABLE",
};

const codeFor = (statusCode: number) => CODE_BY_STATUS[statusCode] ?? (statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR");

/**
 * Postgres errors that mean the request was bad, not the server. The reply
 * never includes Postgres's own message (it names tables and constraints).
 */
const PG_CLIENT_ERRORS: Record<string, { statusCode: number, message: string }> = {
    "23505": { statusCode: 409, message: "That already exists" },
    "23503": { statusCode: 409, message: "It is linked to something that doesn't exist or is still in use" },
    "23502": { statusCode: 400, message: "A required value is missing" },
    "23514": { statusCode: 400, message: "A value is out of the allowed range" },
    "22P02": { statusCode: 400, message: "A value has the wrong format" },
    "22003": { statusCode: 400, message: "A number is out of range" },
    "22001": { statusCode: 400, message: "A value is too long" },
    "22007": { statusCode: 400, message: "A date has the wrong format" },
    "22008": { statusCode: 400, message: "A date is out of range" },
};

const pgErrorCode = (error: unknown) => {
    const code = (error as { code?: unknown })?.code;
    return typeof code === "string" && code in PG_CLIENT_ERRORS ? code : null;
};

const sendError = (res: Response, statusCode: number, message: string, details: unknown = null) =>
    res.status(statusCode).json({
        success: false,
        error: {
            type: codeFor(statusCode),
            message,
            details,
        },
    });

export function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
        }));
        logger.warn({ path: req.path, issues }, "Validation error");
        const first = issues[0];
        const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : "Validation failed";
        return res.status(400).json({
            success: false,
            error: {
                type: "VALIDATION_ERROR",
                message,
                details: { issues },
            },
        });
    }

    if (error instanceof AppError) {
        logger.warn(
            {
                path: req.path,
                statusCode: error.statusCode,
                details: error.details,
            },
            error.message
        );
        return sendError(res, error.statusCode, error.message, error.details ?? null);
    }

    if (error instanceof multer.MulterError) {
        logger.warn({ path: req.path, code: error.code }, "Upload rejected");
        return sendError(res, error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.message);
    }

    // Body-parser errors (malformed JSON, body too large) carry their own 4xx status.
    const status = (error as { status?: unknown, expose?: unknown })?.status;
    if (typeof status === "number" && status >= 400 && status < 500 && (error as { expose?: unknown }).expose) {
        logger.warn({ path: req.path, status }, "Bad request body");
        return sendError(res, status, status === 413 ? "Request body is too large" : "Request body is not valid JSON");
    }

    const pgCode = pgErrorCode(error);
    if (pgCode) {
        const { statusCode, message } = PG_CLIENT_ERRORS[pgCode];
        logger.warn({ path: req.path, pgCode, constraint: (error as { constraint?: string }).constraint }, message);
        return sendError(res, statusCode, message);
    }

    logger.error(
        {
            path: req.path,
            error,
        },
        "Unhandled application error"
    );

    // The raw message is only ever shown on a local development server; it
    // can name tables, constraints and file paths.
    return sendError(
        res,
        500,
        process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : "Something went wrong"
    );
}
