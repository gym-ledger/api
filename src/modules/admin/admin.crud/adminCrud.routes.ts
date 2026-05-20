import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    listWorkoutProgramsForAdmin,
    viewWorkoutProgramForAdmin,
    createWorkoutProgramForAdmin,
    updateWorkoutProgramForAdmin,
    deleteWorkoutProgramForAdmin,
    listExercisesForAdmin,
    viewExerciseForAdmin,
    createExerciseForAdmin,
    updateExerciseForAdmin,
    deleteExerciseForAdmin,
} from './adminCrud.controller.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 5, // 5MB
    },
});

const adminCrudRouter = Router();

// exercises
adminCrudRouter.get("/exercises/list", asyncHandler(listExercisesForAdmin));
adminCrudRouter.get("/exercises/view/:id", asyncHandler(viewExerciseForAdmin));
adminCrudRouter.post("/exercises/create", upload.single("image"), asyncHandler(createExerciseForAdmin));
adminCrudRouter.put("/exercises/update/:id", upload.single("image"), asyncHandler(updateExerciseForAdmin));
adminCrudRouter.delete("/exercises/delete/:id", asyncHandler(deleteExerciseForAdmin));

// workout programs
adminCrudRouter.get("/workout-programs/list", asyncHandler(listWorkoutProgramsForAdmin));
adminCrudRouter.get("/workout-programs/view/:id", asyncHandler(viewWorkoutProgramForAdmin));
adminCrudRouter.post("/workout-programs/create", asyncHandler(createWorkoutProgramForAdmin));
adminCrudRouter.put("/workout-programs/update/:id", asyncHandler(updateWorkoutProgramForAdmin));
adminCrudRouter.delete("/workout-programs/delete/:id", asyncHandler(deleteWorkoutProgramForAdmin));




export default adminCrudRouter;