import { PRIVACY_POLICY_VERSION } from "../../config/constants.js";
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
    onboarded_at: user.onboarded_at ?? null,
    // false = the web app asks the user to accept the current policy first.
    privacy_policy_accepted: user.privacy_policy_version === PRIVACY_POLICY_VERSION,
    current_privacy_policy_version: PRIVACY_POLICY_VERSION,
    ai_checkins_enabled: !!user.ai_checkins_enabled,
    created_at: user.created_at,
});
