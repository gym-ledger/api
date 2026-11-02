import { pinoHttp } from "pino-http";

import { logger } from "../config/logger.js";

// Not mounted (app.ts uses httpLogger from config/logger.ts). Never log
// req.body here: it carries passwords, OTPs and reset tokens. Headers go
// through the logger's redaction list (REDACTED_PATHS).
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
                headers: req.headers,
            };
        },
    },
});