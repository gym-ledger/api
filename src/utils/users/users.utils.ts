import { UsersInterface } from "../../db/schemas/users/users.schema.js";

/**
 * The shape of a user that is safe to send to clients — never includes
 * `password_hash`. `has_password` lets the client decide whether to ask for
 * the current password when changing it.
 */
export const toPublicUser = (user: UsersInterface) => ({
    id: user.id,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    email: user.email ?? null,
    phone_country_code: user.phone_country_code ?? null,
    phone_number: user.phone_number ?? null,
    has_password: !!user.password_hash,
    created_at: user.created_at,
});
