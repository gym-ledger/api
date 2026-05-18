import * as pinoModule from "pino";
import { env } from "./env.js";
import { pinoHttp } from "pino-http";

const pinoFactory = pinoModule.pino;

// 1. Core Pino Instance
export const logger = pinoFactory({
    level: env.LOG_LEVEL || "info",
    transport:
        env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    // Tell pino-pretty what keys to completely remove from the output line
                    ignore: "pid,hostname,responseTime,res",
                    messageKey: "msg"
                },
            }
            : undefined,
});

// 2. The HTTP middleware instance
export const httpLogger = pinoHttp({
    logger: logger,
    serializers: {
        req(req) {
            // Only output req object details if it's an error
            if (req.raw?.res?.statusCode >= 400) {
                return {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                };
            }
            return undefined;
        },
        res(res) {
            // Only output res object details if it's an error
            if (res.raw?.statusCode >= 400) return res;
            return undefined;
        }
    },
    customSuccessMessage(req, res, responseTime) {
        return `${req.method} ${req.url} (${res.statusCode}): ${responseTime}ms`;
    },
    customErrorMessage(req, res, error) {
        return `${req.method} ${req.url} failed with status ${res.statusCode}: ${error.message}`;
    }
});
