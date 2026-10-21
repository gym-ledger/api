/**
 * Like Promise.all(items.map(fn)), but with at most `limit` calls running at
 * once, so a large import can't take every database connection in the pool
 * (security audit S-14). Rejects with the first error, like Promise.all.
 */
export const mapWithConcurrency = async <T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
};

/** Rows of an import processed at once. */
export const IMPORT_CONCURRENCY = 4;
