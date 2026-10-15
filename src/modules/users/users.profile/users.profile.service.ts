import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { USERS_TABLE } from "../../../db/schemas/users/users.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { resolveSupportedTimezone } from "../../../utils/timezone.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";

export const getUserPreferencesService = async ({
    userId,
}: {
    userId: string;
}) => {
    const preferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
        select: ["timezone", "weight_units", "height_units", "height"],
    }) as UserHealthPreferencesInterface | null;
    return {
        preferences,
    }
}

export const updateUserPreferencesService = async ({
    userId,
    data,
}: {
    userId: string;
    data: Partial<UserHealthPreferencesInterface>;
}) => {
    if (!data) {
        throw new AppError("Data is required", 400);
    }
    const toUpdate: Partial<UserHealthPreferencesInterface> = {};;
    if (data.timezone !== undefined) {
        const timezone = await resolveSupportedTimezone(data.timezone);
        if (!timezone) {
            throw new AppError(`Unsupported timezone: ${String(data.timezone)}`, 400);
        }
        toUpdate.timezone = timezone;
    }
    if (data.weight_units) {
        toUpdate.weight_units = data.weight_units;
    }
    if (data.height_units) {
        toUpdate.height_units = data.height_units;
    }
    if (data.height) {
        toUpdate.height = data.height;
    }
    let preferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserHealthPreferencesInterface | null;
    if (!preferences) {
        if (!toUpdate.timezone) {
            throw new AppError("Timezone is required", 400);
        }
        if (!toUpdate.weight_units) {
            throw new AppError("Weight units are required", 400);
        }
        if (!toUpdate.height_units) {
            throw new AppError("Height units are required", 400);
        }
        if (!toUpdate.height) {
            throw new AppError("Height is required", 400);
        }
        preferences = await addOneInTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            data: {
                user_id: userId,
                ...toUpdate,
            },
        }) as UserHealthPreferencesInterface;
    } else {
        preferences = await updateOneInTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            where: [{
                field: "user_id",
                operator: "=",
                value: userId,
            }],
            data: toUpdate,
        }) as UserHealthPreferencesInterface;
    }
    return {
        preferences: {
            timezone: preferences.timezone,
            weight_units: preferences.weight_units,
            height_units: preferences.height_units,
            height: preferences.height,
        },
    }
}