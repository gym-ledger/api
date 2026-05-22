// utils/parseCsv.ts

import fs from "fs";
import { parse } from "csv-parse";

type ParseCsvOptions<T> = {
    filePath: string;

    /**
     * Optional row transformer
     */
    mapRow?: (row: Record<string, string>) => T;

    /**
     * Skip invalid rows instead of throwing
     */
    skipInvalidRows?: boolean;
};

export const parseCsv = async <T = Record<string, string>>({
    filePath,
    mapRow,
    skipInvalidRows = false,
}: ParseCsvOptions<T>): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        const results: T[] = [];

        const parser = parse({
            columns: true, // Uses first row as keys
            trim: true,
            skip_empty_lines: true,
        });

        fs.createReadStream(filePath)
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
            .on("end", () => {
                resolve(results);
            })
            .on("error", reject);
    });
};