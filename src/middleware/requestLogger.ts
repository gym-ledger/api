import { pinoHttp } from "pino-http";

import { logger } from "../config/logger.js";

export const requestLogger = pinoHttp({
    logger,

    customSuccessMessage(req: Request, res: Response) {
        return `${req.method} ${req.url} completed with ${res.status}`;
    },

    customErrorMessage(req: Request, res: Response, error: Error) {
        return `${req.method} ${req.url} failed with ${res.status}: ${error.message}`;
    },

    serializers: {
        req(req: Request) {
            return {
                method: req.method,
                url: req.url,
                body: req.body,
                headers: req.headers,
            };
        },
    },
});