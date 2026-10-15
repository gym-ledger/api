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

const usersWorkoutRouter = Router();

// Plans
usersWorkoutRouter.get("/plans/public", verifyUserToken, asyncHandler(listPublicWorkoutPlans));
usersWorkoutRouter.get("/plans/mine", verifyUserToken, asyncHandler(listMyWorkoutPlans));
usersWorkoutRouter.post("/plans/select", verifyUserToken, asyncHandler(selectWorkoutPlan));
usersWorkoutRouter.delete("/plans/:assignmentId", verifyUserToken, asyncHandler(deactivateWorkoutPlan));
usersWorkoutRouter.post("/plans/:assignmentId/activate", verifyUserToken, asyncHandler(activateWorkoutPlan));
usersWorkoutRouter.post("/plans/:assignmentId/reset-to-source", verifyUserToken, asyncHandler(resetWorkoutPlanToSource));
usersWorkoutRouter.get("/plans/:workoutProgramVersionId/detail", verifyUserToken, asyncHandler(getPlanDetail));

// Plan editing (the user's own copy of a plan)
usersWorkoutRouter.post("/plans/:workoutProgramVersionId/sessions/:daySessionId/exercises", verifyUserToken, asyncHandler(addPlanExercise));
usersWorkoutRouter.put("/plans/:workoutProgramVersionId/sessions/:daySessionId/exercise-order", verifyUserToken, asyncHandler(reorderPlanExercises));
usersWorkoutRouter.put("/plans/:workoutProgramVersionId/exercises/:planExerciseId", verifyUserToken, asyncHandler(updatePlanExercise));
usersWorkoutRouter.delete("/plans/:workoutProgramVersionId/exercises/:planExerciseId", verifyUserToken, asyncHandler(removePlanExercise));

// Day / session / exercise browsing
usersWorkoutRouter.get("/assignments/active", verifyUserToken, asyncHandler(listActiveWorkoutPlans));
usersWorkoutRouter.get("/assignments/:assignmentId/days", verifyUserToken, asyncHandler(listDaysForAssignment));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions", verifyUserToken, asyncHandler(listSessionsForDay));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions/:sessionId/exercises", verifyUserToken, asyncHandler(listExercisesForSession));

// Session lifecycle
usersWorkoutRouter.post("/sessions/start", verifyUserToken, asyncHandler(startWorkoutSession));
usersWorkoutRouter.post("/sessions/:sessionId/adhoc-exercise", verifyUserToken, asyncHandler(addAdhocExerciseToSession));
usersWorkoutRouter.get("/sessions/ongoing", verifyUserToken, asyncHandler(getOngoingWorkoutSession));
usersWorkoutRouter.get("/sessions/:sessionId/sets", verifyUserToken, asyncHandler(getSessionSets));
usersWorkoutRouter.post("/sessions/:sessionId/finish", verifyUserToken, asyncHandler(finishWorkoutSession));

// Set logging
usersWorkoutRouter.post("/sets", verifyUserToken, asyncHandler(createWorkoutSet));
usersWorkoutRouter.put("/sets/:setId", verifyUserToken, asyncHandler(updateWorkoutSet));
usersWorkoutRouter.post("/sets/batch", verifyUserToken, asyncHandler(createWorkoutSetsBatch));

// Exercise history
usersWorkoutRouter.get("/exercises/:exerciseId/history", verifyUserToken, asyncHandler(getExerciseHistory));

// Past workout sessions
usersWorkoutRouter.get("/sessions", verifyUserToken, asyncHandler(listWorkoutSessions));
usersWorkoutRouter.get("/sessions/:sessionId/detail", verifyUserToken, asyncHandler(getWorkoutSessionDetail));

// Dashboard alarms
usersWorkoutRouter.get("/alarms/active", verifyUserToken, asyncHandler(listActiveAlarms));
usersWorkoutRouter.post("/alarms/:alarmId/discard", verifyUserToken, asyncHandler(discardAlarm));

// Dashboard stats
usersWorkoutRouter.get("/stats/dashboard", verifyUserToken, asyncHandler(getDashboardStats));
usersWorkoutRouter.get("/stats/recent-prs", verifyUserToken, asyncHandler(getRecentPRs));
usersWorkoutRouter.get("/stats/progress-overview", verifyUserToken, asyncHandler(getProgressOverview));

export default usersWorkoutRouter;
