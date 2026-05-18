import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";

export const sendOtpForLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { method, phoneNumber, email } = req.body;
        if (method === "phone") {
            if (!phoneNumber?.code) {
                return next(new AppError("Invalid phone number code", 400));
            }
            if (!phoneNumber?.number?.match(/^[0-9]{10}$/)) {
                return next(new AppError("Invalid phone number", 400));
            }
        } else if (method === "email") {
            if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                return next(new AppError("Invalid email", 400));
            }
        } else {
            return next(new AppError("Invalid method", 400));
        }
    } catch (error) {
        next(error);
    }
}