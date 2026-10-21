import { Router } from "express";
import usersWeightRouter from './users.weight/users.weight.routes.js';
import usersProfileRouter from './users.profile/users.profile.routes.js';
import usersWorkoutRouter from './users.workout/users.workout.routes.js';
import usersExercisesRouter from './users.exercises/users.exercises.routes.js';
import usersMuscleSignalsRouter from './users.muscleSignals/users.muscleSignals.routes.js';
import usersCheckinsRouter from './users.checkins/users.checkins.routes.js';
import usersNotificationsRouter from './users.notifications/users.notifications.routes.js';
import usersAccountRouter from './users.account/users.account.routes.js';

const usersRouter = Router();

usersRouter.use("/profile", usersProfileRouter);
usersRouter.use("/weight", usersWeightRouter);
usersRouter.use("/workout", usersWorkoutRouter);
usersRouter.use("/exercises", usersExercisesRouter);
usersRouter.use("/muscle-signals", usersMuscleSignalsRouter);
usersRouter.use("/checkins", usersCheckinsRouter);
usersRouter.use("/notifications", usersNotificationsRouter);
usersRouter.use("/account", usersAccountRouter);
export default usersRouter;