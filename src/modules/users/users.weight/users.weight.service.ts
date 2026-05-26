import { DateTime } from "luxon";
import { addOneInTable, fetchManyFromTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { USER_WEIGHT_ENTRIES_TABLE, UserWeightEntriesInterface } from "../../../db/schemas/users/weight/userWeightEntries.schema.js";
import { USER_WEIGHT_MOVING_AVERAGES_TABLE, UserWeightMovingAveragesInterface } from "../../../db/schemas/users/weight/userWeightMovingAverages.schema.js";
import { reCalculateUserWeightMovingAverages } from "../../../utils/users/users.weight.utils.js";
import { importUserWeightEntries } from "./users.weight.controller.js";
import { parseCsv } from "../../../utils/csv.js";
import { prettyFloat } from "../../../utils/math.js";

export const getUserWeightInViewService = async ({
    userId,
    viewId,
    date
}: {
    userId: string,
    viewId: string | null
    date: string | null
}) => {
    if (viewId) { } else {
        if (!date) {
            throw new AppError("Date is required", 400);
        }
        let timezone: string = "Asia/Kolkata";
        const userPreferences = await fetchOneFromTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            filter: {
                user_id: userId,
            },
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
                three_day_moving_average: prettyFloat(average.three_day_moving_average || 0),
                seven_day_moving_average: prettyFloat(average.seven_day_moving_average || 0),
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
        }
    }
}
export const createUserWeightEntryService = async ({
    userId,
    weight,
    date
}: {
    userId: string,
    weight: number,
    date: string,
}) => {
    if (!weight) {
        throw new AppError("Weight is required", 400);
    }
    if (!date) {
        throw new AppError("Date is required", 400);
    }
    let timezone: string = "Asia/Kolkata";
    const userPreferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        filter: {
            user_id: userId,
        },
    }) as UserHealthPreferencesInterface | null;
    if (userPreferences) {
        timezone = userPreferences.timezone;
    }

    const dateVal = DateTime.fromISO(date, { zone: timezone }).toJSDate();
    const day = DateTime.fromISO(date, { zone: timezone }).toISODate();

    let entry = await fetchOneFromTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        filter: {
            user_id: userId,
            day,
        },
    }) as UserWeightEntriesInterface | null;
    if (entry) {
        entry = await updateOneInTable({
            table: USER_WEIGHT_ENTRIES_TABLE,
            filter: {
                id: entry.id,
            },
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
        filter: {
            id: entryId,
            user_id: userId,
        },
    }) as UserWeightEntriesInterface | null;
    if (!entry) {
        throw new AppError("Entry not found", 404);
    }
    entry = await updateOneInTable({
        table: USER_WEIGHT_ENTRIES_TABLE,
        filter: {
            id: entryId,
        },
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
    for (const weightEntry of weightEntries) {
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
            console.log(weightEntry.date);
            const dateObj = DateTime.fromISO(weightEntry.date, { zone: "Asia/Kolkata" });
            if (!dateObj.isValid) {
                throw new AppError("Invalid date", 400);
            }
            console.log(dateObj.toISO());
            await createUserWeightEntryService({
                userId,
                weight,
                date: dateObj.toISO(),
            });
        } catch (error) {
            console.log(error);
            throw new AppError("Error importing weight entries", 500);
        }
    }
    // }));
    return {
        weight_entries: weightEntries,
    }
}