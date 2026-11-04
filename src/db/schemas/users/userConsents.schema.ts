export const USER_CONSENTS_TABLE = "user_consents";

export type ConsentKind = "privacy_policy" | "ai_checkins";
export type ConsentAction = "accepted" | "withdrawn";
/** Where a consent was given; keep in sync with migration 045's CHECK. */
export type ConsentSource = "prompt" | "notice" | "ai_consent" | "settings" | "backfill";

/** Append-only: rows are inserted, never updated (migration 045). */
export interface UserConsentsInterface {
    id: string;
    user_id: string;
    kind: ConsentKind;
    action: ConsentAction;
    version: string | null;
    source: ConsentSource;
    created_at: Date;
}
