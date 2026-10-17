import { Router } from "express";
const adminRouter = Router();
import adminAuthRouter from "./admin.auth/adminAuth.routes.js";
import adminCrudRouter from "./admin.crud/adminCrud.routes.js";
import adminAnalyticsRouter from "./admin.analytics/adminAnalytics.routes.js";
import { verifyAdminToken } from "../../middleware/authenticationMiddleware.js";

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/crud", verifyAdminToken, adminCrudRouter);
adminRouter.use("/analytics", verifyAdminToken, adminAnalyticsRouter);

export default adminRouter;