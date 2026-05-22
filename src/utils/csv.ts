// utils/parseCsv.ts

import { Readable } from "stream";
import { parse } from "csv-parse";

type ParseCsvOptions<T> = {
    buffer: Buffer;

    mapRow?: (row: Record<string, string>) => T;

    skipInvalidRows?: boolean;
};

export const parseCsv = async <
    T = Record<string, string>
>({
    buffer,
    mapRow,
    skipInvalidRows = false,
}: ParseCsvOptions<T>): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        const results: T[] = [];

        const parser = parse({
            columns: true,
            trim: true,
            skip_empty_lines: true,
        });

        const stream = Readable.from(buffer);

        stream
            .pipe(parser)
            .on("data", (row: Record<string, string>) => {
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
            .on("error", reject);
    });
};