import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    listPublicWorkoutPlansService,
    listMyWorkoutPlansService,
    listActiveWorkoutPlansService,
    selectWorkoutPlanService,
    deactivateWorkoutPlanService,
    listDaysForAssignmentService,
    listSessionsForDayService,
    listExercisesForSessionService,
    startWorkoutSessionService,
    getSessionSetsService,
    finishWorkoutSessionService,
    createWorkoutSetService,
    getExerciseHistoryService,
    listWorkoutSessionsService,
    getWorkoutSessionDetailService,
    listActiveAlarmsService,
    discardAlarmService,
} from "./users.workout.service.js";

// Plans
export const listPublicWorkoutPlans = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listPublicWorkoutPlansService();
        return responseSend(res, 200, "Public workout plans fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listMyWorkoutPlans = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listMyWorkoutPlansService(req.userId);
        return responseSend(res, 200, "Workout plan selections fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listActiveWorkoutPlans = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listActiveWorkoutPlansService(req.userId);
        return responseSend(res, 200, "Active workout plan selections fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const selectWorkoutPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await selectWorkoutPlanService({
            userId: req.userId,
            workout_program_id: req.body.workout_program_id,
        });
        return responseSend(res, 200, "Workout plan selected successfully", data);
    } catch (error) {
        next(error);
    }
}

export const deactivateWorkoutPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await deactivateWorkoutPlanService({
            userId: req.userId,
            assignmentId: req.params.assignmentId as string,
        });
        return responseSend(res, 200, "Workout plan deselected successfully", data);
    } catch (error) {
        next(error);
    }
}

// Day / session / exercise browsing
export const listDaysForAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listDaysForAssignmentService({
            userId: req.userId,
            assignmentId: req.params.assignmentId as string,
        });
        return responseSend(res, 200, "Days fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listSessionsForDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listSessionsForDayService({
            userId: req.userId,
            assignmentId: req.params.assignmentId as string,
            dayId: req.params.dayId as string,
        });
        return responseSend(res, 200, "Sessions fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listExercisesForSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listExercisesForSessionService({
            userId: req.userId,
            assignmentId: req.params.assignmentId as string,
            dayId: req.params.dayId as string,
            sessionId: req.params.sessionId as string,
        });
        return responseSend(res, 200, "Exercises fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

// Session lifecycle
export const startWorkoutSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await startWorkoutSessionService({
            userId: req.userId,
            assignment_id: req.body.assignment_id,
            program_day_id: req.body.program_day_id,
            program_day_session_id: req.body.program_day_session_id,
        });
        return responseSend(res, 200, "Workout session started successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getSessionSets = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getSessionSetsService({
            userId: req.userId,
            sessionId: req.params.sessionId as string,
        });
        return responseSend(res, 200, "Session sets fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const finishWorkoutSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await finishWorkoutSessionService({
            userId: req.userId,
            sessionId: req.params.sessionId as string,
        });
        return responseSend(res, 200, "Workout session finished successfully", data);
    } catch (error) {
        next(error);
    }
}

// Set logging
export const createWorkoutSet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await createWorkoutSetService({
            userId: req.userId,
            workout_session_id: req.body.workout_session_id,
            workout_program_exercise_id: req.body.workout_program_exercise_id,
            weight: req.body.weight,
            tool_weight: req.body.tool_weight,
            reps: req.body.reps,
            rir: req.body.rir,
            effort: req.body.effort,
            discomfort_notes: req.body.discomfort_notes,
            alarm_message: req.body.alarm_message,
        });
        return responseSend(res, 200, "Set logged successfully", data);
    } catch (error) {
        next(error);
    }
}

// Exercise history
export const getExerciseHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const data = await getExerciseHistoryService({
            userId: req.userId,
            exerciseId: req.params.exerciseId as string,
            limit,
            beforeSessionId: req.query.beforeSessionId as string | undefined,
        });
        return responseSend(res, 200, "Exercise history fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

// Past workout sessions
export const listWorkoutSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listWorkoutSessionsService({
            userId: req.userId,
            page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        });
        return responseSend(res, 200, "Workout sessions fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getWorkoutSessionDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getWorkoutSessionDetailService({
            userId: req.userId,
            sessionId: req.params.sessionId as string,
        });
        return responseSend(res, 200, "Workout session detail fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

// Dashboard alarms
export const listActiveAlarms = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listActiveAlarmsService(req.userId);
        return responseSend(res, 200, "Active alarms fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const discardAlarm = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await discardAlarmService({
            userId: req.userId,
            alarmId: req.params.alarmId as string,
        });
        return responseSend(res, 200, "Alarm discarded successfully", data);
    } catch (error) {
        next(error);
    }
}
