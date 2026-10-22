export const USER_WEIGHT_MOVING_AVERAGES_TABLE = "user_weight_moving_averages";

export interface UserWeightMovingAveragesInterface {
    id: string;

    user_id: string;

    three_day_moving_average: number | null;

    seven_day_moving_average: number | null;

    date: Date;

    day: string;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}