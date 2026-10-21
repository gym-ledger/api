import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { credentialCheckLimiter } from "../../../middleware/rateLimiters.js";
import {
    changePassword,
    endOtherSessions,
    endSession,
    getAccount,
    listSessions,
} from "./adminAccount.controller.js";

// The signed-in admin's own account: profile, password and devices.
const adminAccountRouter = Router();

adminAccountRouter.get("/", asyncHandler(getAccount));
adminAccountRouter.put("/password", credentialCheckLimiter, asyncHandler(changePassword));

adminAccountRouter.get("/sessions", asyncHandler(listSessions));
adminAccountRouter.post("/sessions/sign-out-others", asyncHandler(endOtherSessions));
adminAccountRouter.delete("/sessions/:id", asyncHandler(endSession));

export default adminAccountRouter;
