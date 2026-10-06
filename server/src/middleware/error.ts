import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/errors";
import { isProd } from "../config/env";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(ApiError.notFound("Endpoint not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: {
        message: "Please check the highlighted fields.",
        code: "VALIDATION_ERROR",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const field = ((err.meta?.target as string[]) ?? []).join(", ");
      return res.status(409).json({
        success: false,
        error: {
          message: field ? `A record with this ${field} already exists.` : "Already exists.",
          code: "CONFLICT",
        },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { message: "Resource not found.", code: "NOT_FOUND" },
      });
    }
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: { message: "Payload is too large.", code: "PAYLOAD_TOO_LARGE" },
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: { message: "Malformed request body.", code: "BAD_JSON" },
    });
  }

  console.error("[api] Unhandled error:", err);

  return res.status(500).json({
    success: false,
    error: {
      message: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
      ...(isProd ? {} : { stack: (err as Error)?.stack }),
    },
  });
};
