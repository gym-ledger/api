import { fileURLToPath } from "node:url";

// Two levels up from src/scripts or dist/scripts.
export const EXERCISE_SEED_FILE = fileURLToPath(new URL("../../seeds/exercises.json", import.meta.url));

export interface ExerciseSeedFile {
    exported_at: string;
    muscles: {
        slug: string,
        name: string,
        parent_slug: string | null,
        body_region: string | null,
        display_order: number,
        xp_enabled: boolean,
        recovery_enabled: boolean,
    }[];
    exercises: {
        slug: string,
        name: string,
        description: string | null,
        image_url: string | null,
        muscles: { muscle: string, contribution: number }[],
    }[];
}
