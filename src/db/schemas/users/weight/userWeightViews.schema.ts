export const USER_WEIGHT_VIEWS_TABLE = "user_weight_views";

export interface UserWeightViewsInterface {
    id: string;

    user_id: string;

    from_date: Date;

    duration_type: "till-now" | "till-date";

    to_date: Date | null;

    weight_entries: unknown[];

    weight_moving_averages: unknown[];

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}