/**
 * ============================================================================
 *  TERMS OF USE + PRIVACY POLICY VERSIONS: read this before changing either.
 * ============================================================================
 *
 * The text lives in the web app (gym-ledger/web: src/app/terms/page.tsx and
 * src/app/privacy/page.tsx; users accept both together). This list is the
 * ONLY place versions are defined; the web app reads the current one from
 * the API (GET /legal/policy and the user payload) and keeps no copy.
 *
 * Changing the text (anything a user could read differently):
 *   1. Append a new entry at the end of POLICY_VERSIONS: version
 *      "YYYY-MM-DD.N" (sorts as a string), effective_date, a one-line plain
 *      summary of what changed (users see it), and `reconsent`.
 *   2. In the web repo, run `npm run policy:lock -- <version>` so its CI
 *      check knows the text change was versioned.
 *
 * `reconsent` decides who must accept again before using the app:
 *   - "everyone"     the change is material: new data collected, a new
 *                    purpose, a new third party, rights or terms changed.
 *   - "ai_checkins"  material only for people who turned AI check-ins on
 *                    (e.g. more data sent to the model provider).
 *   - "none"         wording, typos, clarifications, contact details. Users
 *                    only see a dismissible "policy updated" notice.
 *
 * ONLY MATERIAL VERSIONS ASK USERS TO ACCEPT AGAIN, BUT ERR ON THE SIDE OF
 * ASKING AGAIN: if you are not sure a change is non-material, use
 * "everyone". Asking again costs a tap; failing to ask when it mattered is
 * a consent problem. Never edit or remove a published entry: users' stored
 * acceptances refer to it.
 *
 * Every acceptance is logged in user_consents (append-only, migration 045);
 * users.privacy_policy_version is only a cache of the latest one.
 * ============================================================================
 */

export type ReconsentScope = "everyone" | "ai_checkins" | "none";

export interface PolicyVersion {
    /** "YYYY-MM-DD" or "YYYY-MM-DD.N"; string order is version order. */
    version: string;
    /** The date shown as "Last updated" (YYYY-MM-DD). */
    effective_date: string;
    /** Who has to accept this version again before carrying on. */
    reconsent: ReconsentScope;
    /** What changed, in one short sentence a user understands. */
    summary: string;
}

export const POLICY_VERSIONS: readonly PolicyVersion[] = [
    {
        version: "2026-10-21",
        effective_date: "2026-10-21",
        reconsent: "everyone",
        summary: "First terms of use and privacy policy; AI check-ins became opt-in.",
    },
    {
        version: "2026-10-21.2",
        effective_date: "2026-10-21",
        reconsent: "everyone",
        summary: "You can download your data and delete your account.",
    },
    {
        version: "2026-10-23.1",
        effective_date: "2026-10-23",
        reconsent: "everyone",
        summary: "Records of failed and slow requests are kept for 30 days.",
    },
    {
        version: "2026-10-28.1",
        effective_date: "2026-10-28",
        reconsent: "everyone",
        summary: "AI check-ins also send muscles whose sets you rated as poorly felt.",
    },
    {
        version: "2026-11-02.1",
        effective_date: "2026-11-02",
        reconsent: "ai_checkins",
        summary: "Days off are stored with their reason and note; AI check-ins send how many you took and why, never the note.",
    },
    {
        version: "2026-11-02.2",
        effective_date: "2026-11-02",
        // Changes how future changes are handled (only material ones are
        // asked again), and starts a history of acceptances: material.
        reconsent: "everyone",
        summary: "Only important changes ask you to accept again; smaller ones show a notice. Your acceptances are kept as a history.",
    },
];

export const CURRENT_POLICY: PolicyVersion = POLICY_VERSIONS[POLICY_VERSIONS.length - 1];

/** The version users accept now (terms + privacy together). */
export const PRIVACY_POLICY_VERSION = CURRENT_POLICY.version;

export const isKnownPolicyVersion = (version: string) => POLICY_VERSIONS.some((v) => v.version === version);

/** Versions published after `accepted` (all of them when nothing was accepted). */
export const policyVersionsSince = (accepted: string | null, versions: readonly PolicyVersion[] = POLICY_VERSIONS): PolicyVersion[] =>
    versions.filter((v) => accepted == null || v.version > accepted);

/**
 * Whether this user must accept the current version before using the app:
 * never accepted, or a newer version needs it from them.
 */
export const needsPolicyReconsent = (
    accepted: string | null,
    aiCheckinsEnabled: boolean,
    versions: readonly PolicyVersion[] = POLICY_VERSIONS,
): boolean =>
    accepted == null ||
    policyVersionsSince(accepted, versions).some(
        (v) => v.reconsent === "everyone" || (v.reconsent === "ai_checkins" && aiCheckinsEnabled),
    );
