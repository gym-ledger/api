export const USER_WEIGHT_ENTRIES_TABLE = "user_weight_entries";

export interface UserWeightEntriesInterface {
    id: string;

    user_id: string;

    weight: number;

    date: Date;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}