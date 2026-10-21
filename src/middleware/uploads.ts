import multer from "multer";
import path from "path";
import { AppError } from "../shared/errors/AppError.js";

// Spreadsheet apps and browsers label CSV files inconsistently, so the
// extension decides and these MIME types are accepted alongside it.
const CSV_MIME_TYPES = new Set([
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",
]);

/**
 * An optional single image (plus the form's text fields) held in memory.
 * The MIME check only turns away obvious mistakes early; the image is
 * decoded and re-encoded before it is stored (infrastructure/storage).
 */
export const imageUpload = (maxBytes: number) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 11 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new AppError("Upload a JPG, PNG or WebP image", 400));
        }
        cb(null, true);
    },
});

/**
 * A single `.csv` file held in memory (security audit S-22): one file, a few
 * form fields, and nothing that isn't a CSV.
 */
export const csvUpload = (maxBytes: number) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 11 },
    fileFilter: (_req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== ".csv" || !CSV_MIME_TYPES.has(file.mimetype)) {
            return cb(new AppError("Upload a .csv file", 400));
        }
        cb(null, true);
    },
});
