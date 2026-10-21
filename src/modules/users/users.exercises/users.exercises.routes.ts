import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getExerciseForUser,
    listExercisesForUser,
    listMusclesForUser,
} from "./users.exercises.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { listExercisesQuery } from "./users.exercises.schemas.js";

const usersExercisesRouter = Router();

// Registered before "/:id" so the literal path isn't swallowed by the param route.
usersExercisesRouter.get("/muscles", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listMusclesForUser));
usersExercisesRouter.get("/", verifyUserToken, validate({ query: listExercisesQuery, body: noInput }), asyncHandler(listExercisesForUser));
usersExercisesRouter.get("/:id", verifyUserToken, validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(getExerciseForUser));

export default usersExercisesRouter;
