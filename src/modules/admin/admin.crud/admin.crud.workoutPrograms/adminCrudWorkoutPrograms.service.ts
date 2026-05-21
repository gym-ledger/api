import { AppError } from "../../../../shared/errors/AppError.js";
import { addOneInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, updateOneInTable } from "../../../index/index.repository.js";
import { WORKOUT_PROGRAMS_TABLE, WorkoutProgramsInterface } from "../../../../db/schemas/workoutPrograms/workoutPrograms.schema.js";
import { fetchWorkoutProgramWithVersionsService } from "../adminCrud.repository.js";
import { isValidUUID } from "../../../../utils/validation.js";
import { ProgramDaysInterface } from "../../../../db/schemas/workoutPrograms/programDays.schema.js";
import { responseSend } from "../../../../helpers/response-send.js";


export const listWorkoutProgramsForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10, search = "", createdBy = "admin_user" } = data;
    const filter = {
        // search: search,
        // createdBy: createdBy,
    };
    const workoutPrograms = await fetchPaginatedResultsFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        filter,
        limit,
        page,
    }) as {
        data: WorkoutProgramsInterface[];
        meta: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
        };
    };
    return workoutPrograms;
}

export const viewWorkoutProgramForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }

    const workoutProgram = await fetchWorkoutProgramWithVersionsService(id);
    if (!workoutProgram) {
        throw new AppError("Workout program not found", 404);
    }

    return workoutProgram;
}

export const createWorkoutProgramForAdminService = async (data: {
    name: string,
    description: string,
    image: string,
    video: string,
    program_days: ProgramDaysInterface[],
    training_days: number,
    split_type: string,
    session_ordering_logic: string,
    duration_type: string,
    duration_weeks: number,
    visibility: string,
    added_by_admin_user_id: string,
}) => {

    const sampleProgramData = {
        "name": "sdfsd",
        "visibility": "public",
        "description": "",
        "training_days": 1,
        "split_type": "ppl",
        "session_ordering_logic": "sequential",
        "duration_type": "finite",
        "duration_weeks": 8,
        "version_visibility": "public",
        "days": [
            {
                "dayNumber": 1,
                "name": "",
                "sessions": [
                    {
                        "tempId": "49db0bc8-fa7e-40b2-bebc-24385d3255b2",
                        "name": "Morning",
                        "exercises": [
                            {
                                "tempId": "1ba6e266-76ab-4041-b26e-743f8342900e",
                                "exercise_id": "80dcc0df-56d6-49f3-a4f5-a9858d880fd9",
                                "exercise_name": "Barbell Back Squat",
                                "exercise_order": 1,
                                "target_sets": 3,
                                "min_reps": 8,
                                "max_reps": 12,
                                "target_rir": null,
                                "rest_seconds": 90,
                                "tempo": "",
                                "notes": "",
                                "visibility": "public"
                            }
                        ],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 2,
                "name": "",
                "sessions": [
                    {
                        "tempId": "8c217c22-a87f-4131-a345-1e691c38a14f",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 3,
                "name": "",
                "sessions": [
                    {
                        "tempId": "ee6b52a5-93ac-4739-827c-f3bca4e28b55",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 4,
                "name": "",
                "sessions": [
                    {
                        "tempId": "396c9683-9a74-4dd4-8731-f1ae9d7a8695",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 5,
                "name": "",
                "sessions": [
                    {
                        "tempId": "5e65aeaa-0ae5-4cc8-a113-79243511c871",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 6,
                "name": "",
                "sessions": [
                    {
                        "tempId": "d79020fd-8065-43d6-999d-c3f17c47cc92",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            },
            {
                "dayNumber": 7,
                "name": "",
                "sessions": [
                    {
                        "tempId": "ea5c610b-8814-45c4-af4f-f4ccbe3e2c1a",
                        "name": "Morning",
                        "exercises": [],
                        "visibility": "public"
                    }
                ],
                "visibility": "public"
            }
        ]
    }

    const {
        name,
        description,
        training_days,
        split_type,
        session_ordering_logic,
        duration_type,
        duration_weeks,
        visibility,
        program_days,
        added_by_admin_user_id,
    } = data;

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    if (program_days) {
        for (const programDay of program_days) {
            if (!programDay.name) {
                throw new AppError("Program day name is required", 400);
            }
            if (!programDay.day_number) {
                throw new AppError("Program day day number is required", 400);
            }
            if (!programDay.sessions || programDay.sessions.length === 0) {
                throw new AppError("Program day sessions are required", 400);
            }
            for (const session of programDay.sessions) {
                if (!session.name) {
                    if (programDay.sessions.length > 0) {
                        throw new AppError("Session name is required", 400);
                    } else {
                        session.name = "Default";
                    }
                }
                if (!session.exercises || session.exercises.length === 0) {
                    throw new AppError("Session exercises are required", 400);
                }
                for (const exercise of session.exercises) {
                    if (!exercise.exercise_id) {
                        throw new AppError("Exercise id is required", 400);
                    }
                    if (!isValidUUID(exercise.exercise_id)) {
                        throw new AppError("Invalid exercise id", 400);
                    }
                    if (!exercise.exercise_order) {
                        throw new AppError("Exercise order is required", 400);
                    }
                    if (!exercise.target_sets) {
                        throw new AppError("Target sets is required", 400);
                    }
                    if (!exercise.min_reps) {
                        throw new AppError("Min reps is required", 400);
                    }
                    if (!exercise.max_reps) {
                        throw new AppError("Max reps is required", 400);
                    }
                }
            }
        }
    }

    const payload = {
        name: name,
        description: description,
        training_days: training_days,
        split_type: split_type,
        session_ordering_logic: session_ordering_logic,
        duration_type: duration_type,
        duration_weeks: duration_weeks,
        visibility: visibility,
        program_days: program_days,
        added_by_admin_user_id: added_by_admin_user_id,
    }

    return payload;
}

export const updateWorkoutProgramForAdminService = async (data: { id: string, name: string, description: string, image: string, video: string }) => {
}

export const deleteWorkoutProgramForAdminService = async (data: { id: string }) => {
}