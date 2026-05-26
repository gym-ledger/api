import { DateTime } from "luxon";
import { USER_WEIGHT_ENTRIES_TABLE, UserWeightEntriesInterface } from "../../db/schemas/users/weight/userWeightEntries.schema.js";
import { addOneInTable, fetchManyFromTable, fetchOneFromTable, updateOneInTable } from "../../modules/index/index.repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { prettyFloat } from "../math.js";
import { USER_WEIGHT_MOVING_AVERAGES_TABLE, UserWeightMovingAveragesInterface } from "../../db/schemas/users/weight/userWeightMovingAverages.schema.js";
import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../db/schemas/users/userHealthPreferences.schema.js";

export const reCalculateUserWeightMovingAverages = async ({
    userId,
    date,
}: {
    userId: string,
    date: string,
}) => {
    try {
        if (!date) {
            throw new AppError("Date is required", 400);
        }
        if (!userId) {
            throw new AppError("User ID is required", 400);
        }
        let timezone: string = "Asia/Kolkata";
        const userPreferences = await fetchOneFromTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            filter: {
                user_id: userId,
            },
            select: ["timezone"],
        }) as Partial<UserHealthPreferencesInterface> | null;
        if (userPreferences?.timezone) {
            timezone = userPreferences.timezone;
        }
        // from = date minus 6 days
        // to = date plus 6 days
        console.log("CURRENT DATE", date);
        const from = DateTime.fromISO(date, { zone: "Asia/Kolkata" }).minus({ days: 7 }).toISO();
        const to = DateTime.fromISO(date, { zone: "Asia/Kolkata" }).plus({ days: 5 }).toISO();
        const weightEntries = await fetchManyFromTable({
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
            sortBy: {
                date: "asc",
            },
        }) as Partial<UserWeightEntriesInterface>[];
        console.log(weightEntries);
        console.log(from)
        console.log(to)
        console.log(userId)
        const dayPayload: Record<string, { three_day_average: number, seven_day_average: number }> = {};
        let threeDayVals: number[] = [prettyFloat(weightEntries?.[0]?.weight || 0)];
        let sevenDayVals: number[] = [prettyFloat(weightEntries?.[0]?.weight || 0)];
        for (let i = 1; i < weightEntries.length; i++) {
            // is today one day after last day?
            if (!weightEntries[i].day || !weightEntries[i - 1].day) {
                console.log("No day found");
                threeDayVals = [prettyFloat(weightEntries[i].weight || 0)];
                sevenDayVals = [prettyFloat(weightEntries[i].weight || 0)];
                continue;
            }
            const currentDay = DateTime.fromISO(weightEntries[i].day as string, { zone: "utc" });
            const lastDay = DateTime.fromISO(weightEntries[i - 1].day as string, { zone: "utc" });
            // if only one day away
            console.log(lastDay.diff(currentDay, 'days').days);
            if (lastDay.diff(currentDay, 'days').days === -1) {
                threeDayVals.push(prettyFloat(weightEntries[i].weight || 0));
                sevenDayVals.push(prettyFloat(weightEntries[i].weight || 0));
            } else {
                console.log("Not one day away");
                threeDayVals = [prettyFloat(weightEntries[i].weight || 0)];
                sevenDayVals = [prettyFloat(weightEntries[i].weight || 0)];
            }
            if (threeDayVals.length >= 3) {
                dayPayload[weightEntries[i].day as string] = {
                    ...dayPayload[weightEntries[i].day as string],
                    three_day_average: prettyFloat(threeDayVals.reduce((a, b) => a + b, 0) / 3)
                };
                threeDayVals = threeDayVals.slice(1);
            }
            if (sevenDayVals.length >= 7) {
                dayPayload[weightEntries[i].day as string] = {
                    ...dayPayload[weightEntries[i].day as string],
                    seven_day_average: prettyFloat(sevenDayVals.reduce((a, b) => a + b, 0) / 7),
                };
                sevenDayVals = sevenDayVals.slice(1);
            }
        }
        await Promise.all(Object.entries(dayPayload).map(async ([day, payload]) => {
            const movingAvgEntry = await fetchOneFromTable({
                table: USER_WEIGHT_MOVING_AVERAGES_TABLE,
                filter: {
                    user_id: userId,
                    day,
                },
            }) as UserWeightMovingAveragesInterface | null;
            if (movingAvgEntry) {
                const payloadToUpdate: Partial<UserWeightMovingAveragesInterface> = {};
                if (payload.three_day_average) {
                    payloadToUpdate.three_day_moving_average = payload.three_day_average;
                }
                if (payload.seven_day_average) {
                    payloadToUpdate.seven_day_moving_average = payload.seven_day_average;
                }
                if (Object.keys(payloadToUpdate).length > 0) {
                    await updateOneInTable({
                        table: USER_WEIGHT_MOVING_AVERAGES_TABLE,
                        filter: {
                            id: movingAvgEntry.id,
                        },
                        data: payloadToUpdate,
                    });
                }
            } else {
                const payloadToCreate: Partial<UserWeightMovingAveragesInterface> = {
                    user_id: userId,
                    day,
                    date: DateTime.fromISO(day, { zone: timezone }).toJSDate(),
                };
                if (payload.three_day_average) {
                    payloadToCreate.three_day_moving_average = payload.three_day_average;
                }
                if (payload.seven_day_average) {
                    payloadToCreate.seven_day_moving_average = payload.seven_day_average;
                }
                if (Object.keys(payloadToCreate).length > 0) {
                    await addOneInTable({
                        table: USER_WEIGHT_MOVING_AVERAGES_TABLE,
                        data: payloadToCreate,
                    }) as UserWeightMovingAveragesInterface;
                }
            }
        }));
        console.log(dayPayload);

    } catch (error) {
        console.error('Error re-calculating user weight moving averages', error);
    }
}