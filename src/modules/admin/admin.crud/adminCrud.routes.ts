import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";

import {
    listMusclesForAdmin,
    viewMuscleForAdmin,
    createMuscleForAdmin,
    updateMuscleForAdmin,
    deleteMuscleForAdmin,
    getMusclesDropdownForAdmin,
    importMusclesForAdmin,
    exportMusclesForAdmin,
} from './admin.crud.muscles/adminCrudMuscles.controller.js';

import {
    listWorkoutProgramsForAdmin,
    viewWorkoutProgramForAdmin,
    createWorkoutProgramForAdmin,
    updateWorkoutProgramForAdmin,
    deleteWorkoutProgramForAdmin,
} from './admin.crud.workoutPrograms/adminCrudWorkoutPrograms.controller.js';
import {
    listExercisesForAdmin,
    viewExerciseForAdmin,
    createExerciseForAdmin,
    updateExerciseForAdmin,
    deleteExerciseForAdmin,
    importExercisesForAdmin,
    exportExercisesForAdmin
} from './admin.crud.exercises/adminCrudExercises.controller.js';
import {
    listProgressionRulesForAdmin,
    viewProgressionRuleForAdmin,
    createProgressionRuleForAdmin,
    updateProgressionRuleForAdmin,
    deleteProgressionRuleForAdmin,
} from './admin.crud.progressionRules/adminCrudProgressionRules.controller.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 5, // 5MB
    },
});

const adminCrudRouter = Router();

// muscles
adminCrudRouter.get("/muscles/list", asyncHandler(listMusclesForAdmin));
adminCrudRouter.get("/muscles/view/:id", asyncHandler(viewMuscleForAdmin));
adminCrudRouter.post("/muscles/create", asyncHandler(createMuscleForAdmin));
adminCrudRouter.put("/muscles/update/:id", asyncHandler(updateMuscleForAdmin));
adminCrudRouter.delete("/muscles/delete/:id", asyncHandler(deleteMuscleForAdmin));
adminCrudRouter.get("/muscles/dropdown", asyncHandler(getMusclesDropdownForAdmin));
adminCrudRouter.post("/muscles/import", upload.single("file"), asyncHandler(importMusclesForAdmin));
adminCrudRouter.get("/muscles/export", asyncHandler(exportMusclesForAdmin));

// exercises
adminCrudRouter.get("/exercises/list", asyncHandler(listExercisesForAdmin));
adminCrudRouter.get("/exercises/view/:id", asyncHandler(viewExerciseForAdmin));
adminCrudRouter.post("/exercises/create", upload.single("image"), asyncHandler(createExerciseForAdmin));
adminCrudRouter.put("/exercises/update/:id", upload.single("image"), asyncHandler(updateExerciseForAdmin));
adminCrudRouter.delete("/exercises/delete/:id", asyncHandler(deleteExerciseForAdmin));
adminCrudRouter.post("/exercises/import", upload.single("file"), asyncHandler(importExercisesForAdmin));
adminCrudRouter.get("/exercises/export", asyncHandler(exportExercisesForAdmin));

// progression rules
adminCrudRouter.get("/progression-rules/list", asyncHandler(listProgressionRulesForAdmin));
adminCrudRouter.get("/progression-rules/view/:id", asyncHandler(viewProgressionRuleForAdmin));
adminCrudRouter.post("/progression-rules/create", asyncHandler(createProgressionRuleForAdmin));
adminCrudRouter.put("/progression-rules/update/:id", asyncHandler(updateProgressionRuleForAdmin));
adminCrudRouter.delete("/progression-rules/delete/:id", asyncHandler(deleteProgressionRuleForAdmin));


// workout programs
adminCrudRouter.get("/workout-programs/list", asyncHandler(listWorkoutProgramsForAdmin));
adminCrudRouter.get("/workout-programs/view/:id", asyncHandler(viewWorkoutProgramForAdmin));
adminCrudRouter.post("/workout-programs/create", asyncHandler(createWorkoutProgramForAdmin));
adminCrudRouter.put("/workout-programs/update/:id", asyncHandler(updateWorkoutProgramForAdmin));
adminCrudRouter.delete("/workout-programs/delete/:id", asyncHandler(deleteWorkoutProgramForAdmin));




export default adminCrudRouter;