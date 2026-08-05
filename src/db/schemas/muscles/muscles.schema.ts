export const MUSCLES_TABLE = "muscles";

export interface MusclesInterface {
    id: string;
    name: string;
    slug: string;
    parent_muscle_id: string | null;
    xp_enabled: boolean;
    recovery_enabled: boolean;
    body_region: string | null;
    display_order: number;
    added_by_admin_user_id: string;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
    children_muscles?: string[];
}