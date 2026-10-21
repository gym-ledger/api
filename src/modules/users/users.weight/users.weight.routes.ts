import { Router } from "express";
import multer from "multer";
import { uploadLimiter } from "../../../middleware/rateLimiters.js";
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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 10, // 10MB
    },
});
const usersWeightRouter = Router();

usersWeightRouter.get("/views-list", verifyUserToken, asyncHandler(getUserWeightViews));
usersWeightRouter.post("/view", verifyUserToken, asyncHandler(createUserWeightView));

usersWeightRouter.get("/view", verifyUserToken, asyncHandler(getUserWeightInView));
usersWeightRouter.get("/view/:id", verifyUserToken, asyncHandler(getUserWeightInView));
usersWeightRouter.post("/entry", verifyUserToken, asyncHandler(createUserWeightEntry));
usersWeightRouter.put("/entry/:id", verifyUserToken, asyncHandler(updateUserWeightEntry));
usersWeightRouter.delete("/entry/:id", verifyUserToken, asyncHandler(deleteUserWeightEntry));
usersWeightRouter.get("/entries", verifyUserToken, asyncHandler(getUserWeightEntries));
usersWeightRouter.post("/entries/import", verifyUserToken, uploadLimiter, upload.single("file"), asyncHandler(importUserWeightEntries));

export default usersWeightRouter;