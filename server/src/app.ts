import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { env, isProd } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./routes/auth.routes";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 400,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { success: false, error: { message: "Too many requests.", code: "RATE_LIMITED" } },
    }),
  );

  const uploadDir = path.resolve(__dirname, "../storage/uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use("/uploads", express.static(uploadDir, { maxAge: isProd ? "7d" : 0 }));

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", uptime: process.uptime() } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
