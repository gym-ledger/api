export const USER_NOTIFICATIONS_TABLE = "user_notifications";

export interface UserNotificationsInterface {
    id: string;
    user_id: string;
    type: string;
    group_key: string | null;
    dedupe_key: string | null;
    title: string;
    body: string;
    link: string | null;
    read_at: Date | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
