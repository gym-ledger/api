import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { USERS_TABLE, UsersInterface } from "../../../db/schemas/users/users.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { resolveSupportedTimezone } from "../../../utils/timezone.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { hashPassword, validateNewPassword, verifyPassword } from "../../../utils/authentication.js";
import { toPublicUser } from "../../../utils/users/users.utils.js";

const NAME_MAX_LENGTH = 100;

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

const fetchUserOrThrow = async (userId: string) => {
    const user = await fetchOneFromTable({
        table: USERS_TABLE,
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface | null;
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return user;
}

export const getUserSelfProfileService = async ({ userId }: { userId: string }) => {
    return toPublicUser(await fetchUserOrThrow(userId));
}

/**
 * Sets the user's name. `firstName` is required and non-empty; `lastName`
 * is optional — omit it to leave it unchanged, send null or "" to clear it.
 */
export const updateUserNameService = async ({
    userId,
    data,
}: {
    userId: string;
    data: { firstName?: unknown; lastName?: unknown };
}) => {
    const firstName = typeof data?.firstName === "string" ? data.firstName.trim() : "";
    if (!firstName) {
        throw new AppError("First name is required", 400);
    }
    if (firstName.length > NAME_MAX_LENGTH) {
        throw new AppError(`First name must be at most ${NAME_MAX_LENGTH} characters`, 400);
    }
    const toUpdate: Record<string, unknown> = {
        first_name: firstName,
        updated_at: new Date(),
    };
    if (data.lastName !== undefined) {
        if (data.lastName !== null && typeof data.lastName !== "string") {
            throw new AppError("Last name must be a string", 400);
        }
        const lastName = data.lastName?.trim() || null;
        if (lastName && lastName.length > NAME_MAX_LENGTH) {
            throw new AppError(`Last name must be at most ${NAME_MAX_LENGTH} characters`, 400);
        }
        toUpdate.last_name = lastName;
    }
    const user = await updateOneInTable({
        table: USERS_TABLE,
        data: toUpdate,
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface | null;
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return toPublicUser(user);
}

/**
 * Sets a new password for the logged-in user. If they already have one,
 * `currentPassword` must match it; users who have only ever logged in via
 * OTP have no password yet and can set one directly.
 */
export const changeUserPasswordService = async ({
    userId,
    data,
}: {
    userId: string;
    data: { currentPassword?: unknown; newPassword?: unknown };
}) => {
    const { currentPassword, newPassword } = data ?? {};
    validateNewPassword(newPassword);
    const user = await fetchUserOrThrow(userId);
    if (user.password_hash) {
        if (typeof currentPassword !== "string" || !currentPassword) {
            throw new AppError("Current password is required", 400);
        }
        if (!await verifyPassword(currentPassword, user.password_hash)) {
            throw new AppError("Current password is incorrect", 400);
        }
        if (await verifyPassword(newPassword, user.password_hash)) {
            throw new AppError("New password must be different from the current password", 400);
        }
    }
    await updateOneInTable({
        table: USERS_TABLE,
        data: {
            password_hash: await hashPassword(newPassword),
            updated_at: new Date(),
        },
        where: [{ field: "id", operator: "=", value: userId }],
    });
}
