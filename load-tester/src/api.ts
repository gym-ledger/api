// The parts of the API's responses the simulated users read (the `data` of the envelope). Only
// the fields used here, and read defensively: a change in the API shows as a skipped step or a
// warning in the run, not a crash.

/** A list endpoint: a bare array or a `{ data: [...], meta }` page. */
export type Listing<T> = T[] | { data?: T[] } | null | undefined;

export interface Profile {
    onboarded_at?: string | null;
    privacy_policy_accepted?: boolean;
    current_privacy_policy_version?: string;
    ai_checkins_enabled?: boolean;
}

/** Login and refresh. */
export interface SessionTokens {
    accessToken?: string;
    accessTokenExpiresAt?: string;
    user?: Profile;
}

export interface AuthConfig {
    captcha?: unknown;
}

export interface PublicPlan {
    workout_program_id: string;
    workout_program_version_id: string;
}

export interface PlanAssignment {
    id: string;
    workout_program_version_id: string;
    current_program_day_id?: string | null;
}

/** Days, day sessions, workout sessions, exercises: anything picked by id. */
export interface WithId {
    id: string;
}

export interface PlanExercise {
    id: string;
    target_sets?: number | null;
    min_reps?: number | null;
    max_reps?: number | null;
    exercise?: { id: string } | null;
}

export interface OngoingWorkout {
    session_id: string;
    assignment_id: string;
    program_day_id: string | null;
    program_day_session_id: string | null;
}

export interface Notification {
    id: string;
    read_at?: string | null;
}

export interface WeightView {
    weight_entries?: { id: string; day: string }[];
}

export interface PersonalRecord {
    exercise_id: string;
}

export interface Muscle {
    body_region?: string;
}

export interface SetsBatchResult {
    results?: { set?: { id: string } }[];
}

/** Whatever list a response holds. */
export const list = <T>(x: Listing<T>): T[] => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : []);
