import { Router } from "express";
import { uploadLimiter } from "../../../middleware/rateLimiters.js";
import { csvUpload, imageUpload } from "../../../middleware/uploads.js";
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
    listWorkoutProgramVersionsForAdmin,
    createWorkoutProgramForAdmin,
    updateWorkoutProgramForAdmin,
    createWorkoutProgramVersionForAdmin,
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

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { createProgressionRuleBody, exerciseFormBody, exportMusclesQuery, listExercisesQuery, listMusclesQuery, listProgressionRulesQuery, listWorkoutProgramsQuery, muscleBody, musclesDropdownQuery, updateProgressionRuleBody, viewWorkoutProgramQuery, workoutProgramBody, workoutProgramVersionBody } from "./adminCrud.schemas.js";
import { auditAdminAction } from "../admin.audit/adminAudit.middleware.js";

const csvFileUpload = csvUpload(1024 * 1024 * 5); // 5MB
const exerciseImageUpload = imageUpload(1024 * 1024 * 5); // 5MB

const adminCrudRouter = Router();

// muscles
adminCrudRouter.get("/muscles/list", validate({ query: listMusclesQuery, body: noInput }), asyncHandler(listMusclesForAdmin));
adminCrudRouter.get("/muscles/view/:id", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(viewMuscleForAdmin));
adminCrudRouter.post("/muscles/create", auditAdminAction("muscle", "create"), validate({ query: noInput, body: muscleBody }), asyncHandler(createMuscleForAdmin));
adminCrudRouter.put("/muscles/update/:id", auditAdminAction("muscle", "update"), validate({ params: uuidParams("id"), query: noInput, body: muscleBody }), asyncHandler(updateMuscleForAdmin));
adminCrudRouter.delete("/muscles/delete/:id", auditAdminAction("muscle", "delete"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(deleteMuscleForAdmin));
adminCrudRouter.get("/muscles/dropdown", validate({ query: musclesDropdownQuery, body: noInput }), asyncHandler(getMusclesDropdownForAdmin));
adminCrudRouter.post("/muscles/import", uploadLimiter, csvFileUpload.single("file"), auditAdminAction("muscle", "import"), validate({ query: noInput, body: noInput }), asyncHandler(importMusclesForAdmin));
adminCrudRouter.get("/muscles/export", validate({ query: exportMusclesQuery, body: noInput }), asyncHandler(exportMusclesForAdmin));

// exercises
adminCrudRouter.get("/exercises/list", validate({ query: listExercisesQuery, body: noInput }), asyncHandler(listExercisesForAdmin));
adminCrudRouter.get("/exercises/view/:id", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(viewExerciseForAdmin));
adminCrudRouter.post("/exercises/create", uploadLimiter, exerciseImageUpload.single("image"), auditAdminAction("exercise", "create"), validate({ query: noInput, body: exerciseFormBody }), asyncHandler(createExerciseForAdmin));
adminCrudRouter.put("/exercises/update/:id", uploadLimiter, exerciseImageUpload.single("image"), auditAdminAction("exercise", "update"), validate({ params: uuidParams("id"), query: noInput, body: exerciseFormBody }), asyncHandler(updateExerciseForAdmin));
adminCrudRouter.delete("/exercises/delete/:id", auditAdminAction("exercise", "delete"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(deleteExerciseForAdmin));
adminCrudRouter.post("/exercises/import", uploadLimiter, csvFileUpload.single("file"), auditAdminAction("exercise", "import"), validate({ query: noInput, body: noInput }), asyncHandler(importExercisesForAdmin));
adminCrudRouter.get("/exercises/export", validate({ query: noInput, body: noInput }), asyncHandler(exportExercisesForAdmin));

// progression rules
adminCrudRouter.get("/progression-rules/list", validate({ query: listProgressionRulesQuery, body: noInput }), asyncHandler(listProgressionRulesForAdmin));
adminCrudRouter.get("/progression-rules/view/:id", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(viewProgressionRuleForAdmin));
adminCrudRouter.post("/progression-rules/create", auditAdminAction("progression_rule", "create"), validate({ query: noInput, body: createProgressionRuleBody }), asyncHandler(createProgressionRuleForAdmin));
adminCrudRouter.put("/progression-rules/update/:id", auditAdminAction("progression_rule", "update"), validate({ params: uuidParams("id"), query: noInput, body: updateProgressionRuleBody }), asyncHandler(updateProgressionRuleForAdmin));
adminCrudRouter.delete("/progression-rules/delete/:id", auditAdminAction("progression_rule", "delete"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(deleteProgressionRuleForAdmin));


// workout programs
adminCrudRouter.get("/workout-programs/list", validate({ query: listWorkoutProgramsQuery, body: noInput }), asyncHandler(listWorkoutProgramsForAdmin));
adminCrudRouter.get("/workout-programs/view/:id", validate({ params: uuidParams("id"), query: viewWorkoutProgramQuery, body: noInput }), asyncHandler(viewWorkoutProgramForAdmin));
adminCrudRouter.get("/workout-programs/:id/versions", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(listWorkoutProgramVersionsForAdmin));
adminCrudRouter.post("/workout-programs/create", auditAdminAction("workout_program", "create"), validate({ query: noInput, body: workoutProgramBody }), asyncHandler(createWorkoutProgramForAdmin));
adminCrudRouter.put("/workout-programs/update/:id", auditAdminAction("workout_program", "update"), validate({ params: uuidParams("id"), query: noInput, body: workoutProgramBody }), asyncHandler(updateWorkoutProgramForAdmin));
adminCrudRouter.post("/workout-programs/:id/versions", auditAdminAction("workout_program", "create"), validate({ params: uuidParams("id"), query: noInput, body: workoutProgramVersionBody }), asyncHandler(createWorkoutProgramVersionForAdmin));
adminCrudRouter.delete("/workout-programs/delete/:id", auditAdminAction("workout_program", "delete"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(deleteWorkoutProgramForAdmin));




export default adminCrudRouter;