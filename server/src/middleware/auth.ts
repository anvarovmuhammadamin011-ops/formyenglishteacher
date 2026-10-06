import type { RequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/tokens";
import type { AuthUser } from "../types/express";

function extractToken(req: Parameters<RequestHandler>[0]): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies?.elms_at) return cookies.elms_at;
  return null;
}

/**
 * Resolves the caller from the access token and re-reads the account from the
 * database on every request, so role/status changes take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || user.status !== "ACTIVE") {
      throw ApiError.unauthorized("This account is no longer active.");
    }

    const { deletedAt: _ignored, ...authUser } = user;
    req.user = authUser as AuthUser;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized());
  }
};

export function requireRole(...roles: Array<"TEACHER" | "STUDENT">): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to access this resource."));
    }
    next();
  };
}

export const requireTeacher = requireRole("TEACHER");
export const requireStudent = requireRole("STUDENT");
