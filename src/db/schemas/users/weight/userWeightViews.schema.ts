export const USER_WEIGHT_VIEWS_TABLE = "user_weight_views";

export interface UserWeightViewsInterface {
    id: string;

    user_id: string;

    from_date: Date;

    to_date: Date;

    weight_entries: any[];

    weight_moving_averages: any[];

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}