export const USER_WEIGHT_MOVING_AVERAGES_TABLE = "user_weight_moving_averages";

export interface UserWeightMovingAveragesInterface {
    id: string;

    user_id: string;

    three_day_moving_average: number;

    seven_day_moving_average: number;

    date: Date;

    day: string;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}