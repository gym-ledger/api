import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";

import { env } from "./config/env.js";
import { API_PREFIX } from "./config/constants.js";
import { httpLogger } from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import router from "./modules/index/index.routes.js";

// import adminRoutes from "./src/modules/admin/admin.routes";
// import appRoutes from "./src/modules/app/app.routes";

const app = express();

if (env.TRUST_PROXY_HOPS !== undefined) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
}

app.use(helmet());
// Only the configured front-ends may call the API from a browser, and with
// credentials (the refresh-token cookie). In development, with no list set,
// any origin is reflected so local ports just work.
app.use(cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : env.NODE_ENV !== "production",
    credentials: true,
}));
app.use(compression());
app.use(express.json());


app.use(httpLogger as any);

app.get("/health", (_, res) => {
    res.json({ ok: true });
});

app.use(API_PREFIX, router);

// app.use("/api/v1/admin", adminRoutes);
// app.use("/api/v1/app", appRoutes);

app.use(errorHandler);

export default app;