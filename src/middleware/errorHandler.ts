import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { ZodError } from "zod";

import { logger } from "../config/logger.js";

import { AppError } from "../shared/errors/AppError.js";

export function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    // console.log(error);
    if (error instanceof ZodError) {
        logger.warn(
            {
                path: req.path,
                issues: error.flatten(),
            },
            "Validation error"
        );

        return res.status(400).json({
            success: false,

            error: {
                type: "VALIDATION_ERROR",

                message: "Validation failed",

                details: error.flatten(),
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

        return res.status(error.statusCode).json({
            success: false,

            error: {
                type: error.constructor.name,

                message: error.message,

                details: error.details ?? null,
            },
        });
    }

    logger.error(
        {
            path: req.path,
            error,
        },
        "Unhandled application error"
    );

    return res.status(500).json({
        success: false,

        error: {
            type: "INTERNAL_SERVER_ERROR",

            message:
                process.env.NODE_ENV === "production"
                    ? "Something went wrong"
                    : error instanceof Error
                        ? error.message
                        : "Unknown error",
        },
    });
}