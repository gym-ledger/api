// utils/parseCsv.ts

import { Readable } from "stream";
import { parse } from "csv-parse";
import { AppError } from "../shared/errors/AppError.js";

/** Default row cap for CSV imports (security audit S-14). */
export const CSV_MAX_ROWS = 5000;

type ParseCsvOptions<T> = {
    buffer: Buffer;

    mapRow?: (row: Record<string, string>) => T;

    skipInvalidRows?: boolean;

    /** More data rows than this rejects the whole file with a 400. */
    maxRows?: number;
};

export const parseCsv = async <
    T = Record<string, string>
>({
    buffer,
    mapRow,
    skipInvalidRows = false,
    maxRows = CSV_MAX_ROWS,
}: ParseCsvOptions<T>): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        const results: T[] = [];
        let rowCount = 0;

        const parser = parse({
            columns: true,
            trim: true,
            skip_empty_lines: true,
        });

        const stream = Readable.from(buffer);

        stream
            .pipe(parser)
            .on("data", (row: Record<string, string>) => {
                rowCount += 1;
                if (rowCount > maxRows) {
                    stream.destroy();
                    parser.destroy();
                    reject(new AppError(`The file has more than ${maxRows} rows. Split it and import each part`, 400));
                    return;
                }
                try {
                    const parsedRow = mapRow
                        ? mapRow(row)
                        : (row as T);

                    results.push(parsedRow);
                } catch (err) {
                    if (!skipInvalidRows) {
                        reject(err);
                    }
                }
            })
            .on("end", () => resolve(results))
            // A malformed file is the uploader's mistake, not a server error.
            .on("error", (err) => reject(new AppError(`The file isn't valid CSV: ${err.message}`, 400)));
    });
};
