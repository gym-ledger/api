import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { credentialCheckLimiter, otpSendLimiter } from "../../../middleware/rateLimiters.js";
import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    cancelAccountDeletion,
    downloadDataExport,
    getAccountData,
    requestAccountDeletion,
    requestDataExport,
    sendDeletionCode,
} from "./users.account.controller.js";
import { requestDeletionBody } from "./users.account.schemas.js";

const usersAccountRouter = Router();

usersAccountRouter.get("/", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getAccountData));

// Data export
usersAccountRouter.post("/exports", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(requestDataExport));
usersAccountRouter.get("/exports/:id/download", verifyUserToken, validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(downloadDataExport));

// Account deletion
usersAccountRouter.post("/deletion/send-code", verifyUserToken, otpSendLimiter, validate({ query: noInput, body: noInput }), asyncHandler(sendDeletionCode));
usersAccountRouter.post("/deletion", verifyUserToken, credentialCheckLimiter, validate({ query: noInput, body: requestDeletionBody }), asyncHandler(requestAccountDeletion));
usersAccountRouter.post("/deletion/cancel", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(cancelAccountDeletion));

export default usersAccountRouter;
