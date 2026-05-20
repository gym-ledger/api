import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    loginAdmin
} from './adminAuth.controller.js';

const adminAuthRouter = Router();

adminAuthRouter.post("/login", asyncHandler(loginAdmin));
export default adminAuthRouter;