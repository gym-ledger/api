import { AppError } from "./AppError.js";

export class ValidationError extends AppError {
    constructor(message = "Validation failed", details?: unknown) {
        super(message, 400, details);
    }
}