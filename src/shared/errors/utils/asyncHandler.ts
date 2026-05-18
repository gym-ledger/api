import type {
    NextFunction,
    Request,
    Response,
    RequestHandler,
} from "express";

export function asyncHandler(
    handler: RequestHandler
) {
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            next(error);
        }
    };
}