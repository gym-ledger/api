import { CURRENT_POLICY, needsPolicyReconsent, policyVersionsSince } from "../../config/policyVersions.js";
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
    // false = the web app asks the user to accept the current policy first:
    // never accepted, or a newer version is material for them (policyVersions.ts).
    privacy_policy_accepted: !needsPolicyReconsent(user.privacy_policy_version ?? null, !!user.ai_checkins_enabled),
    current_privacy_policy_version: CURRENT_POLICY.version,
    // Set when a newer version exists than the one they accepted: what changed
    // since. With privacy_policy_accepted true, the app shows a dismissible notice.
    privacy_policy_update: user.privacy_policy_version && user.privacy_policy_version !== CURRENT_POLICY.version
        ? {
            version: CURRENT_POLICY.version,
            effective_date: CURRENT_POLICY.effective_date,
            changes: policyVersionsSince(user.privacy_policy_version)
                .map(({ version, effective_date, summary }) => ({ version, effective_date, summary })),
        }
        : null,
    ai_checkins_enabled: !!user.ai_checkins_enabled,
    // Set = the account is deleted on this date; the web app then asks
    // whether to cancel that or sign out again.
    deletion_scheduled_for: user.deletion_scheduled_for ?? null,
    created_at: user.created_at,
});
