import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getUserPreferencesService,
    updateUserPreferencesService,
    getUserSelfProfileService,
    updateUserNameService,
    changeUserPasswordService,
    getWeightGoalService,
    suggestWeightGoalDateService,
    saveWeightGoalService,
    clearWeightGoalService,
    endWeightGoalService,
    getWeightGoalHistoryService,
    completeOnboardingService,
    skipOnboardingService,
    acceptPrivacyPolicyService,
    setAiCheckinsService
} from "./users.profile.service.js";


export const getUserSelfProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getUserSelfProfileService({ userId: req.userId as string });
        responseSend(res, 200, "User profile fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getUserPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const data = await getUserPreferencesService({ userId: userId as string });
        responseSend(res, 200, "User preferences fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const updateUserPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const data = await updateUserPreferencesService({ userId: userId as string, data: req.body });
        responseSend(res, 200, "User preferences updated successfully", data);
    } catch (error) {
        next(error);
    }
}

export const updateUserName = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateUserNameService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Name updated successfully", data);
    } catch (error) {
        next(error);
    }
}

export const changeUserPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await changeUserPasswordService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Password updated successfully", null);
    } catch (error) {
        next(error);
    }
}

export const getWeightGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getWeightGoalService({ userId: req.userId as string });
        responseSend(res, 200, "Weight goal fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const suggestWeightGoalDate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await suggestWeightGoalDateService({
            userId: req.userId as string,
            query: req.query,
        });
        responseSend(res, 200, "Goal date suggested successfully", data);
    } catch (error) {
        next(error);
    }
}

export const saveWeightGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await saveWeightGoalService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Weight goal saved successfully", data);
    } catch (error) {
        next(error);
    }
}

export const clearWeightGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await clearWeightGoalService({ userId: req.userId as string });
        responseSend(res, 200, "Weight goal cleared successfully", null);
    } catch (error) {
        next(error);
    }
}

export const endWeightGoal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await endWeightGoalService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Weight goal ended successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getWeightGoalHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getWeightGoalHistoryService({ userId: req.userId as string });
        responseSend(res, 200, "Weight goal history fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const completeOnboarding = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await completeOnboardingService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Onboarding completed successfully", data);
    } catch (error) {
        next(error);
    }
}

export const skipOnboarding = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await skipOnboardingService({ userId: req.userId as string });
        responseSend(res, 200, "Onboarding skipped", data);
    } catch (error) {
        next(error);
    }
}

export const acceptPrivacyPolicy = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await acceptPrivacyPolicyService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Privacy policy accepted", data);
    } catch (error) {
        next(error);
    }
}

export const setAiCheckins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await setAiCheckinsService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, data.ai_checkins_enabled ? "AI check-ins turned on" : "AI check-ins turned off", data);
    } catch (error) {
        next(error);
    }
}
