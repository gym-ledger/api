import { randomUUID } from "crypto";
import * as pinoModule from "pino";
import { env } from "./env.js";
import { pinoHttp } from "pino-http";

const pinoFactory = pinoModule.pino;

// Credentials that must never reach a log line. Applied to every log call,
// so it also covers errors that happen to carry a request or response.
const REDACTED_PATHS = [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["refresh-token"]',
    'req.headers["x-load-test-key"]',
    'res.headers["set-cookie"]',
    "headers.authorization",
    "headers.cookie",
    'headers["refresh-token"]',
    'headers["x-load-test-key"]',
];

// 1. Core Pino Instance
export const logger = pinoFactory({
    level: env.LOG_LEVEL || "info",
    redact: {
        paths: REDACTED_PATHS,
        censor: "[REDACTED]",
    },
    // Call sites log `{ error }`; pino only serializes Errors under `err` by
    // default, so without this every error is written as `{}`.
    serializers: {
        error: pinoModule.stdSerializers.err,
    },
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
    // A UUID per request, sent back as X-Request-Id, so an error a user
    // reports (or a row on the admin API page) can be matched to its log lines.
    genReqId(_req, res) {
        const id = randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
    },
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
