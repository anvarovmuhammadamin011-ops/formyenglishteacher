import type { NextFunction, Request, RequestHandler, Response } from "express";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code = "ERROR", details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = "Invalid request", details?: unknown) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }
  static forbidden(message = "You do not have permission to do that") {
    return new ApiError(403, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message = "Already exists", details?: unknown) {
    return new ApiError(409, message, "CONFLICT", details);
  }
  static unprocessable(message = "Validation failed", details?: unknown) {
    return new ApiError(422, message, "VALIDATION_ERROR", details);
  }
  static tooMany(message = "Too many requests") {
    return new ApiError(429, message, "RATE_LIMITED");
  }
  static internal(message = "Something went wrong. Please try again.") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const h = (fn: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function okList<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
