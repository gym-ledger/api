import { Router } from "express";
import usersWeightRouter from './users.weight/users.weight.routes.js';
import usersProfileRouter from './users.profile/users.profile.routes.js';
import usersWorkoutRouter from './users.workout/users.workout.routes.js';
import usersExercisesRouter from './users.exercises/users.exercises.routes.js';
import usersMuscleSignalsRouter from './users.muscleSignals/users.muscleSignals.routes.js';

const usersRouter = Router();

usersRouter.use("/profile", usersProfileRouter);
usersRouter.use("/weight", usersWeightRouter);
usersRouter.use("/workout", usersWorkoutRouter);
usersRouter.use("/exercises", usersExercisesRouter);
usersRouter.use("/muscle-signals", usersMuscleSignalsRouter);
export default usersRouter;