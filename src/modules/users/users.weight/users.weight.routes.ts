import { Router } from "express";
import { uploadLimiter } from "../../../middleware/rateLimiters.js";
import { csvUpload } from "../../../middleware/uploads.js";
import { verifyUserToken } from '../../../middleware/authenticationMiddleware.js';
import {
    getUserWeightViews,
    getUserWeightInView,
    createUserWeightView,
    createUserWeightEntry,
    updateUserWeightEntry,
    deleteUserWeightEntry,
    getUserWeightEntries,
    importUserWeightEntries
} from './users.weight.controller.js';
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { createEntryBody, createViewBody, entriesQuery, updateEntryBody, weightInViewQuery } from "./users.weight.schemas.js";

const upload = csvUpload(1024 * 1024 * 10); // 10MB
const usersWeightRouter = Router();

usersWeightRouter.get("/views-list", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getUserWeightViews));
usersWeightRouter.post("/view", verifyUserToken, validate({ query: noInput, body: createViewBody }), asyncHandler(createUserWeightView));

usersWeightRouter.get("/view", verifyUserToken, validate({ query: weightInViewQuery, body: noInput }), asyncHandler(getUserWeightInView));
usersWeightRouter.get("/view/:id", verifyUserToken, validate({ params: uuidParams("id"), query: weightInViewQuery, body: noInput }), asyncHandler(getUserWeightInView));
usersWeightRouter.post("/entry", verifyUserToken, validate({ query: noInput, body: createEntryBody }), asyncHandler(createUserWeightEntry));
usersWeightRouter.put("/entry/:id", verifyUserToken, validate({ params: uuidParams("id"), query: noInput, body: updateEntryBody }), asyncHandler(updateUserWeightEntry));
usersWeightRouter.delete("/entry/:id", verifyUserToken, validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(deleteUserWeightEntry));
usersWeightRouter.get("/entries", verifyUserToken, validate({ query: entriesQuery, body: noInput }), asyncHandler(getUserWeightEntries));
usersWeightRouter.post("/entries/import", verifyUserToken, uploadLimiter, upload.single("file"), validate({ query: noInput, body: noInput }), asyncHandler(importUserWeightEntries));

export default usersWeightRouter;