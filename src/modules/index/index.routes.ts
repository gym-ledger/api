import { Router } from "express";
import authRouter from "../auth/auth.routes.js";

const router = Router();

router.use("/auth", authRouter);

export default router;