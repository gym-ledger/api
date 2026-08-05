import { Router } from "express";
import usersWeightRouter from './users.weight/users.weight.routes.js';
import usersProfileRouter from './users.profile/users.profile.routes.js';
import usersWorkoutRouter from './users.workout/users.workout.routes.js';

const usersRouter = Router();

usersRouter.use("/profile", usersProfileRouter);
usersRouter.use("/weight", usersWeightRouter);
usersRouter.use("/workout", usersWorkoutRouter);
export default usersRouter;