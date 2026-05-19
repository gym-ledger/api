import { Router } from "express";
import authRouter from "../auth/auth.routes.js";
import usersRouter from "../users/users.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/user", usersRouter)

export default router;