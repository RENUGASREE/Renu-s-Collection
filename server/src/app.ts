import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import legacyRoutes from "./routes/legacy.routes.js";
import legacyCommerceRoutes from "./routes/legacy-commerce.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    })
  );

  if (env.isDevelopment) {
    app.use(morgan("dev"));
  } else {
    app.use(morgan("combined"));
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.isProduction ? 300 : 1000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "Renu's Collections API",
      version: "1.0.0",
      docs: `${env.API_PREFIX}/health`,
    });
  });

  app.use(env.API_PREFIX, apiRoutes);
  app.use("/api", legacyRoutes);
  app.use("/api", legacyCommerceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
