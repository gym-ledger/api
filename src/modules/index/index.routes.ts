import { Router } from "express";
import authRouter from "../auth/auth.routes.js";
import usersRouter from "../users/users.routes.js";
import adminRouter from "../admin/admin.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/user", usersRouter)
router.use("/admin", adminRouter)

export default router;