import { z } from "zod";
import { pagination, text } from "../../../middleware/validate.js";

export const listExercisesQuery = z.strictObject({
    ...pagination(100),
    search: text(100).optional(),
    bodyRegion: text(50).optional(),
});
