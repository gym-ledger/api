import { pg } from "../../../infrastructure/postgres/index.js";

export const fetchWorkoutProgramWithVersionsService = async (id: string) => {
    const sqlQuery = `SELECT
    wp.*,

    wpv.*

    FROM workout_programs wp

    INNER JOIN workout_program_versions wpv
    ON wpv.workout_program_id = wp.id

    WHERE wp.id = $1;`

    const result = await pg.query(sqlQuery, [id]);

    return result.rows[0];
}