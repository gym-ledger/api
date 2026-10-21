import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    listPublicWorkoutPlans,
    listMyWorkoutPlans,
    listActiveWorkoutPlans,
    selectWorkoutPlan,
    deactivateWorkoutPlan,
    activateWorkoutPlan,
    resetWorkoutPlanToSource,
    addPlanExercise,
    updatePlanExercise,
    removePlanExercise,
    reorderPlanExercises,
    getPlanDetail,
    listDaysForAssignment,
    listSessionsForDay,
    listExercisesForSession,
    startWorkoutSession,
    addAdhocExerciseToSession,
    getSessionSets,
    finishWorkoutSession,
    getOngoingWorkoutSession,
    createWorkoutSet,
    updateWorkoutSet,
    createWorkoutSetsBatch,
    getExerciseHistory,
    listWorkoutSessions,
    getWorkoutSessionDetail,
    listActiveAlarms,
    discardAlarm,
    getDashboardStats,
    getRecentPRs,
    getProgressOverview,
} from "./users.workout.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { addPlanExerciseBody, addSessionExerciseBody, createSetBody, createSetsBatchBody, exerciseHistoryQuery, listSessionsQuery, recentPrsQuery, reorderPlanExercisesBody, selectPlanBody, startSessionBody, updatePlanExerciseBody, updateSetBody } from "./users.workout.schemas.js";

const usersWorkoutRouter = Router();

// Plans
usersWorkoutRouter.get("/plans/public", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listPublicWorkoutPlans));
usersWorkoutRouter.get("/plans/mine", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listMyWorkoutPlans));
usersWorkoutRouter.post("/plans/select", verifyUserToken, validate({ query: noInput, body: selectPlanBody }), asyncHandler(selectWorkoutPlan));
usersWorkoutRouter.delete("/plans/:assignmentId", verifyUserToken, validate({ params: uuidParams("assignmentId"), query: noInput, body: noInput }), asyncHandler(deactivateWorkoutPlan));
usersWorkoutRouter.post("/plans/:assignmentId/activate", verifyUserToken, validate({ params: uuidParams("assignmentId"), query: noInput, body: noInput }), asyncHandler(activateWorkoutPlan));
usersWorkoutRouter.post("/plans/:assignmentId/reset-to-source", verifyUserToken, validate({ params: uuidParams("assignmentId"), query: noInput, body: noInput }), asyncHandler(resetWorkoutPlanToSource));
usersWorkoutRouter.get("/plans/:workoutProgramVersionId/detail", verifyUserToken, validate({ params: uuidParams("workoutProgramVersionId"), query: noInput, body: noInput }), asyncHandler(getPlanDetail));

// Plan editing (the user's own copy of a plan)
usersWorkoutRouter.post("/plans/:workoutProgramVersionId/sessions/:daySessionId/exercises", verifyUserToken, validate({ params: uuidParams("workoutProgramVersionId", "daySessionId"), query: noInput, body: addPlanExerciseBody }), asyncHandler(addPlanExercise));
usersWorkoutRouter.put("/plans/:workoutProgramVersionId/sessions/:daySessionId/exercise-order", verifyUserToken, validate({ params: uuidParams("workoutProgramVersionId", "daySessionId"), query: noInput, body: reorderPlanExercisesBody }), asyncHandler(reorderPlanExercises));
usersWorkoutRouter.put("/plans/:workoutProgramVersionId/exercises/:planExerciseId", verifyUserToken, validate({ params: uuidParams("workoutProgramVersionId", "planExerciseId"), query: noInput, body: updatePlanExerciseBody }), asyncHandler(updatePlanExercise));
usersWorkoutRouter.delete("/plans/:workoutProgramVersionId/exercises/:planExerciseId", verifyUserToken, validate({ params: uuidParams("workoutProgramVersionId", "planExerciseId"), query: noInput, body: noInput }), asyncHandler(removePlanExercise));

// Day / session / exercise browsing
usersWorkoutRouter.get("/assignments/active", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listActiveWorkoutPlans));
usersWorkoutRouter.get("/assignments/:assignmentId/days", verifyUserToken, validate({ params: uuidParams("assignmentId"), query: noInput, body: noInput }), asyncHandler(listDaysForAssignment));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions", verifyUserToken, validate({ params: uuidParams("assignmentId", "dayId"), query: noInput, body: noInput }), asyncHandler(listSessionsForDay));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions/:sessionId/exercises", verifyUserToken, validate({ params: uuidParams("assignmentId", "dayId", "sessionId"), query: noInput, body: noInput }), asyncHandler(listExercisesForSession));

// Session lifecycle
usersWorkoutRouter.post("/sessions/start", verifyUserToken, validate({ query: noInput, body: startSessionBody }), asyncHandler(startWorkoutSession));
usersWorkoutRouter.post("/sessions/:sessionId/adhoc-exercise", verifyUserToken, validate({ params: uuidParams("sessionId"), query: noInput, body: addSessionExerciseBody }), asyncHandler(addAdhocExerciseToSession));
usersWorkoutRouter.get("/sessions/ongoing", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getOngoingWorkoutSession));
usersWorkoutRouter.get("/sessions/:sessionId/sets", verifyUserToken, validate({ params: uuidParams("sessionId"), query: noInput, body: noInput }), asyncHandler(getSessionSets));
usersWorkoutRouter.post("/sessions/:sessionId/finish", verifyUserToken, validate({ params: uuidParams("sessionId"), query: noInput, body: noInput }), asyncHandler(finishWorkoutSession));

// Set logging
usersWorkoutRouter.post("/sets", verifyUserToken, validate({ query: noInput, body: createSetBody }), asyncHandler(createWorkoutSet));
usersWorkoutRouter.put("/sets/:setId", verifyUserToken, validate({ params: uuidParams("setId"), query: noInput, body: updateSetBody }), asyncHandler(updateWorkoutSet));
usersWorkoutRouter.post("/sets/batch", verifyUserToken, validate({ query: noInput, body: createSetsBatchBody }), asyncHandler(createWorkoutSetsBatch));

// Exercise history
usersWorkoutRouter.get("/exercises/:exerciseId/history", verifyUserToken, validate({ params: uuidParams("exerciseId"), query: exerciseHistoryQuery, body: noInput }), asyncHandler(getExerciseHistory));

// Past workout sessions
usersWorkoutRouter.get("/sessions", verifyUserToken, validate({ query: listSessionsQuery, body: noInput }), asyncHandler(listWorkoutSessions));
usersWorkoutRouter.get("/sessions/:sessionId/detail", verifyUserToken, validate({ params: uuidParams("sessionId"), query: noInput, body: noInput }), asyncHandler(getWorkoutSessionDetail));

// Dashboard alarms
usersWorkoutRouter.get("/alarms/active", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listActiveAlarms));
usersWorkoutRouter.post("/alarms/:alarmId/discard", verifyUserToken, validate({ params: uuidParams("alarmId"), query: noInput, body: noInput }), asyncHandler(discardAlarm));

// Dashboard stats
usersWorkoutRouter.get("/stats/dashboard", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getDashboardStats));
usersWorkoutRouter.get("/stats/recent-prs", verifyUserToken, validate({ query: recentPrsQuery, body: noInput }), asyncHandler(getRecentPRs));
usersWorkoutRouter.get("/stats/progress-overview", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getProgressOverview));

export default usersWorkoutRouter;
