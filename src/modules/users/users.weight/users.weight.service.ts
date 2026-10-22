import { DateTime } from "luxon";
import { addOneInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, QueryCondition, updateOneInTable } from "../../index/index.repository.js";
import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { USER_WEIGHT_ENTRIES_TABLE, UserWeightEntriesInterface } from "../../../db/schemas/users/weight/userWeightEntries.schema.js";
import { USER_WEIGHT_MOVING_AVERAGES_TABLE, UserWeightMovingAveragesInterface } from "../../../db/schemas/users/weight/userWeightMovingAverages.schema.js";
import { reCalculateUserWeightMovingAverages, recalculateUserWeightViewSummaryService } from "../../../utils/users/users.weight.utils.js";
import { parseCsv } from "../../../utils/csv.js";
import { prettyFloat } from "../../../utils/math.js";
import { USER_WEIGHT_VIEWS_TABLE, UserWeightViewsInterface } from "../../../db/schemas/users/weight/userWeightViews.schema.js";

/** About five years of daily weigh-ins (S-14). */
const WEIGHT_IMPORT_MAX_ROWS = 2000;

export const getUserWeightInViewService = async ({
    userId,
    viewId,
    date
}: {
    userId: string | undefined,
    viewId: string | null
    date: string | null
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const allUserViews = await fetchManyFromTable({
        table: USER_WEIGHT_VIEWS_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserWeightViewsInterface[];
    if (viewId) {
        const view = await fetchOneFromTable({
            table: USER_WEIGHT_VIEWS_TABLE,
            where: [{
                field: "id",
                operator: "=",
                value: viewId,
            }, {
                field: "user_id",
                operator: "=",
                value: userId,
            }],
        }) as UserWeightViewsInterface | null;
        if (!view) {
            throw new AppError("View not found", 404);
        }
        return {
            weight_entries: view.weight_entries,
            weight_moving_averages: view.weight_moving_averages,
            views: allUserViews,
        }
    } else {
        if (!date) {
            throw new AppError("Date is required", 400);
        }
        let timezone: string = "Asia/Kolkata";
        const userPreferences = await fetchOneFromTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            where: [{
                field: "user_id",
                operator: "=",
                value: userId,
            }],
        }) as UserHealthPreferencesInterface | null;
        if (userPreferences) {
            timezone = userPreferences.timezone;
        }
        // from is date minus 29 days
        const from = DateTime.fromISO(date, { zone: timezone }).minus({ days: 29 }).startOf("day").toISO();
        const to = DateTime.fromISO(date, { zone: timezone }).endOf("day").toISO();
        let weightEntries = await fetchManyFromTable({
            table: USER_WEIGHT_ENTRIES_TABLE,
            where: [
                {
                    field: "user_id",
                    operator: "=",
                    value: userId,
                },
                {
                    field: "date",
                    operator: ">=",
                    value: from,
                },
                {
                    field: "date",
                    operator: "<=",
                    value: to,
                },
            ],
            select: ["id", "weight", "day"],
            sortBy: {
                date: "asc",
            },
        }) as Partial<UserWeightEntriesInterface>[];
        let weightMovingAverages = await fetchManyFromTable({
            table: USER_WEIGHT_MOVING_AVERAGES_TABLE,
            where: [
                {
                    field: "user_id",
                    operator: "=",
                    value: userId,
                },
                {
                    field: "date",
                    operator: ">=",
                    value: from,
                },
                {
                    field: "date",
                    operator: "<=",
                    value: to,
                },
            ],
            select: ["id", "three_day_moving_average", "seven_day_moving_average", "day"],
            sortBy: {
                date: "asc",
            },
        }) as Partial<UserWeightMovingAveragesInterface>[];

        weightEntries = weightEntries.map((entry: Partial<UserWeightEntriesInterface>) => {
            return {
                ...entry,
                weight: prettyFloat(entry.weight || 0),
            }
        });

        weightMovingAverages = weightMovingAverages.map((average: Partial<UserWeightMovingAveragesInterface>) => {
            return {
                ...average,
                // null = not enough weigh-ins for that average yet. Sending 0
                // instead made charts plot a 0 kg trend.
                three_day_moving_average: average.three_day_moving_average == null ? null : prettyFloat(average.three_day_moving_average),
                seven_day_moving_average: average.seven_day_moving_average == null ? null : prettyFloat(average.seven_day_moving_average),
            }
        });

        // weightEntries = weightEntries.map((entry: Partial<UserWeightEntriesInterface>) => {
        //     if (!entry.date) {
        //         return {};
        //     }
        //     return {
        //         id: entry.id,
        //         user_id: entry.user_id,
        //         weight: entry.weight,
        //         local_date: DateTime
        //             .fromJSDate(entry.date, {
        //                 zone: "utc",
        //             })
        //             .setZone(timezone)
        //             .toISODate(),
        //     }
        // });
        // weightMovingAverages = weightMovingAverages.map((average: Partial<UserWeightMovingAveragesInterface>) => {
        //     if (!average.date) {
        //         return {};
        //     }
        //     return {
        //         id: average.id,
        //         three_day_moving_average: average.three_day_moving_average,
        //         seven_day_moving_average: average.seven_day_moving_average,
        //         local_date: DateTime
        //             .fromJSDate(average.date, {
        //                 zone: "utc",
        //             })
        //             .setZone(timezone)
        //             .toISODate(),
        //     }
        // });
        return {
            weight_entries: weightEntries,
            weight_moving_averages: weightMovingAverages,
            views: allUserViews,
        }
    }
}
export const createUserWeightEntryService = async ({
    userId,
    weight,
    date
}: {
    userId: string | undefined,
    weight: number,
    date: string,
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!weight) {
        throw new AppError("Weight is required", 400);
    }
    if (!date) {
        throw new AppError("Date is required", 400);
    }
    let timezone: string = "Asia/Kolkata";
    const userPreferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserHealthPreferencesInterface | null;
    if (userPreferences) {
        timezone = userPreferences.timezone;
    }

    const dateVal = DateTime.fromISO(date, { zone: timezone }).toJSDate();
    const day = DateTime.fromISO(date, { zone: timezone }).toISODate();

    let entry = await fetchOneFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }, {
            field: "day",
            operator: "=",
            value: day,
        }],
    }) as UserWeightEntriesInterface | null;
    if (entry) {
        entry = await updateOneInTable({
            table: USER_WEIGHT_ENTRIES_TABLE,
            where: [{
                field: "id",
                operator: "=",
                value: entry.id,
            }],
            data: {
                weight,
            },
        }) as UserWeightEntriesInterface;

    } else {
        entry = await addOneInTable({
            table: USER_WEIGHT_ENTRIES_TABLE,
            data: {
                user_id: userId,
                weight,
                date: dateVal,
                day,
            },
        }) as UserWeightEntriesInterface;

    }
    await reCalculateUserWeightMovingAverages({
        userId,
        date: date,
    });
    return {
        user_weight_entry: entry,
    }
}
export const updateUserWeightEntryService = async ({
    userId,
    entryId,
    weight,
}: {
    userId: string,
    entryId: string | null,
    weight: number | null,
}) => {
    if (!entryId) {
        throw new AppError("Entry ID is required", 400);
    }
    if (!weight) {
        throw new AppError("Weight is required", 400);
    }
    let entry = await fetchOneFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: entryId,
        }, {
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserWeightEntriesInterface | null;
    if (!entry) {
        throw new AppError("Entry not found", 404);
    }
    entry = await updateOneInTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: entryId,
        }],
        data: {
            weight: weight,
        },
    }) as UserWeightEntriesInterface;

    await reCalculateUserWeightMovingAverages({
        userId,
        date: entry.day as string,
    });
    return {
        user_weight_entry: entry,
    }
}

export const importUserWeightEntriesService = async ({
    userId,
    file
}: {
    userId: string | undefined,
    file: Express.Multer.File,
}) => {
    if (!file) {
        throw new AppError("File is required", 400);
    }
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const weightEntries = await parseCsv({
        // Each row recalculates the moving averages, one after another.
        maxRows: WEIGHT_IMPORT_MAX_ROWS,
        buffer: file.buffer, mapRow: (row) => {
            return {
                date: row.date,
                weight: row.weight,
            };
        }
    }) as {
        date: string;
        weight: string;
    }[];
    // Promise.all led to race-conditions on createEntryService's reCalculateUserWeightMovingAverages fn
    // await Promise.all(weightEntries.map(async (weightEntry) => {
    for (const [index, weightEntry] of weightEntries.entries()) {
        try {
            if (!weightEntry.date) {
                throw new AppError("Date is required", 400);
            }
            if (!weightEntry.weight) {
                throw new AppError("Weight is required", 400);
            }
            const weight = prettyFloat(weightEntry.weight);
            if (!weight) {
                throw new AppError("Invalid weight", 400);
            }
            // console.log(weightEntry.date);
            const dateObj = DateTime.fromISO(weightEntry.date, { zone: "Asia/Kolkata" });
            if (!dateObj.isValid) {
                throw new AppError("Invalid date", 400);
            }
            // console.log(dateObj.toISO());
            await createUserWeightEntryService({
                userId,
                weight,
                date: dateObj.toISO(),
            });
        } catch (error) {
            // console.log(error);
            // Row 1 is the header line.
            if (error instanceof AppError && error.statusCode < 500) {
                throw new AppError(`Row ${index + 2}: ${error.message}`, 400);
            }
            throw new AppError("Error importing weight entries", 500);
        }
    }
    // }));
    return {
        weight_entries: weightEntries,
    }
}

export const createUserWeightViewService = async ({
    userId,
    fromDate,
    durationType,
    toDate
}: {
    userId: string | undefined,
    fromDate: string,
    durationType: "till-now" | "till-date",
    toDate?: string,
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!fromDate) {
        throw new AppError("From date is required", 400);
    }
    if (!durationType) {
        throw new AppError("Duration type is required", 400);
    }
    if (durationType === "till-now" && toDate) {
        throw new AppError("To date is not allowed for till-now duration type", 400);
    }
    let timezone: string = "Asia/Kolkata";
    const userPreferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserHealthPreferencesInterface | null;
    if (userPreferences) {
        timezone = userPreferences.timezone;
    }
    const fromVal = DateTime.fromISO(fromDate, { zone: timezone });
    if (!fromVal.isValid) {
        throw new AppError("Invalid from date", 400);
    }
    let toVal: DateTime | null = null;
    if (durationType === "till-date") {
        if (!toDate) {
            throw new AppError("To date is required", 400);
        }
        toVal = DateTime.fromISO(toDate, { zone: timezone });
        if (!toVal.isValid) {
            throw new AppError("Invalid to date", 400);
        }
        if (toVal.diff(fromVal).days > 0) {
            throw new AppError("To date must be after from date", 400);
        }
    }
    const createdView = await addOneInTable({
        table: USER_WEIGHT_VIEWS_TABLE,
        data: {
            user_id: userId,
            from_date: fromVal.toJSDate(),
            duration_type: durationType,
            to_date: toVal ? toVal.toJSDate() : null,
        },
    }) as UserWeightViewsInterface;
    await recalculateUserWeightViewSummaryService({
        userId,
        viewId: createdView.id,
    })
    return {
        user_weight_view: createdView,
    }
}

export const getUserWeightViewsService = async ({
    userId,
}: {
    userId: string | undefined,
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const views = await fetchManyFromTable({
        table: USER_WEIGHT_VIEWS_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserWeightViewsInterface[];
    return {
        user_weight_views: views,
    }
}

export const deleteUserWeightEntryService = async ({
    userId,
    entryId,
}: {
    userId: string | undefined,
    entryId: string | null,
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!entryId) {
        throw new AppError("Entry ID is required", 400);
    }
    const entry = await fetchOneFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: entryId,
        }, {
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserWeightEntriesInterface | null;
    if (!entry) {
        throw new AppError("Entry not found", 404);
    }
    await deleteOneFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: entryId,
        }, {
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    });

    await reCalculateUserWeightMovingAverages({
        userId,
        date: entry.day as string,
    });
    return {
        user_weight_entry: entry,
    }
}

export const getUserWeightEntriesService = async ({
    userId,
    lastEntryId,
}: {
    userId: string | undefined,
    lastEntryId: string | null,
}) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const whereCondition: QueryCondition[] = [{
        field: "user_id",
        operator: "=",
        value: userId,
    }];
    if (lastEntryId) {
        const lastEntry = await fetchOneFromTable({
            table: USER_WEIGHT_ENTRIES_TABLE,
            where: [{
                field: "id",
                operator: "=",
                value: lastEntryId,
            }, {
                field: "user_id",
                operator: "=",
                value: userId,
            }],
        }) as UserWeightEntriesInterface | null;
        if (lastEntry) {
            whereCondition.push({
                field: "date",
                operator: "<=",
                value: lastEntry.date,
            });
            whereCondition.push({
                field: "id",
                operator: "!=",
                value: lastEntryId,
            });
        }
    }
    const entries = await fetchManyFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        where: whereCondition,
        select: ["id", "weight", "date", "day"],
        sortBy: {
            date: "asc",
        },
        limit: 20,
    }) as UserWeightEntriesInterface[];
    return {
        user_weight_entries: entries,
    }
}