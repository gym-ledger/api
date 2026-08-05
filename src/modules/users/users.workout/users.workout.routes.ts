import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    listPublicWorkoutPlans,
    listMyWorkoutPlans,
    listActiveWorkoutPlans,
    selectWorkoutPlan,
    deactivateWorkoutPlan,
    listDaysForAssignment,
    listSessionsForDay,
    listExercisesForSession,
    startWorkoutSession,
    getSessionSets,
    finishWorkoutSession,
    createWorkoutSet,
    getExerciseHistory,
    listWorkoutSessions,
    getWorkoutSessionDetail,
    listActiveAlarms,
    discardAlarm,
} from "./users.workout.controller.js";

const usersWorkoutRouter = Router();

// Plans
usersWorkoutRouter.get("/plans/public", verifyUserToken, asyncHandler(listPublicWorkoutPlans));
usersWorkoutRouter.get("/plans/mine", verifyUserToken, asyncHandler(listMyWorkoutPlans));
usersWorkoutRouter.post("/plans/select", verifyUserToken, asyncHandler(selectWorkoutPlan));
usersWorkoutRouter.delete("/plans/:assignmentId", verifyUserToken, asyncHandler(deactivateWorkoutPlan));

// Day / session / exercise browsing
usersWorkoutRouter.get("/assignments/active", verifyUserToken, asyncHandler(listActiveWorkoutPlans));
usersWorkoutRouter.get("/assignments/:assignmentId/days", verifyUserToken, asyncHandler(listDaysForAssignment));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions", verifyUserToken, asyncHandler(listSessionsForDay));
usersWorkoutRouter.get("/assignments/:assignmentId/days/:dayId/sessions/:sessionId/exercises", verifyUserToken, asyncHandler(listExercisesForSession));

// Session lifecycle
usersWorkoutRouter.post("/sessions/start", verifyUserToken, asyncHandler(startWorkoutSession));
usersWorkoutRouter.get("/sessions/:sessionId/sets", verifyUserToken, asyncHandler(getSessionSets));
usersWorkoutRouter.post("/sessions/:sessionId/finish", verifyUserToken, asyncHandler(finishWorkoutSession));

// Set logging
usersWorkoutRouter.post("/sets", verifyUserToken, asyncHandler(createWorkoutSet));

// Exercise history
usersWorkoutRouter.get("/exercises/:exerciseId/history", verifyUserToken, asyncHandler(getExerciseHistory));

// Past workout sessions
usersWorkoutRouter.get("/sessions", verifyUserToken, asyncHandler(listWorkoutSessions));
usersWorkoutRouter.get("/sessions/:sessionId/detail", verifyUserToken, asyncHandler(getWorkoutSessionDetail));

// Dashboard alarms
usersWorkoutRouter.get("/alarms/active", verifyUserToken, asyncHandler(listActiveAlarms));
usersWorkoutRouter.post("/alarms/:alarmId/discard", verifyUserToken, asyncHandler(discardAlarm));

export default usersWorkoutRouter;
