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

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { changePasswordBody, listSessionsQuery } from "./adminAccount.schemas.js";
import { auditAdminAction } from "../admin.audit/adminAudit.middleware.js";
// The signed-in admin's own account: profile, password and devices.
const adminAccountRouter = Router();

adminAccountRouter.get("/", validate({ query: noInput, body: noInput }), asyncHandler(getAccount));
adminAccountRouter.put("/password", credentialCheckLimiter, auditAdminAction("admin_account", "password_change"), validate({ query: noInput, body: changePasswordBody }), asyncHandler(changePassword));

adminAccountRouter.get("/sessions", validate({ query: listSessionsQuery, body: noInput }), asyncHandler(listSessions));
adminAccountRouter.post("/sessions/sign-out-others", auditAdminAction("admin_session", "sign_out"), validate({ query: noInput, body: noInput }), asyncHandler(endOtherSessions));
adminAccountRouter.delete("/sessions/:id", auditAdminAction("admin_session", "sign_out"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(endSession));

export default adminAccountRouter;
