import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getExerciseForUser,
    listExercisesForUser,
    listMusclesForUser,
} from "./users.exercises.controller.js";

const usersExercisesRouter = Router();

// Registered before "/:id" so the literal path isn't swallowed by the param route.
usersExercisesRouter.get("/muscles", verifyUserToken, asyncHandler(listMusclesForUser));
usersExercisesRouter.get("/", verifyUserToken, asyncHandler(listExercisesForUser));
usersExercisesRouter.get("/:id", verifyUserToken, asyncHandler(getExerciseForUser));

export default usersExercisesRouter;
