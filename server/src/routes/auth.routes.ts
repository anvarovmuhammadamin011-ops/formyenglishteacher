import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { h, ok } from "../lib/errors";
import { getBody, validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import * as authService from "../services/auth.service";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../lib/cookies";
import type { Request } from "express";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many sign-in attempts. Try again later.", code: "RATE_LIMITED" } },
});

const loginSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(72),
});

function readRefreshToken(req: Request, bodyToken?: string): string | undefined {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE] ?? bodyToken;
}

export const authRouter = Router();

authRouter.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  h(async (req, res) => {
    const { username, password } = getBody<{ username: string; password: string }>(req);
    const { user, accessToken, refreshToken } = await authService.login(username, password);
    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, { user, accessToken, refreshToken });
  }),
);

authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  h(async (req, res) => {
    const { refreshToken: bodyToken } = getBody<{ refreshToken?: string }>(req);
    const token = readRefreshToken(req, bodyToken);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: "Your session has expired. Please sign in again.", code: "UNAUTHORIZED" },
      });
    }
    const { user, accessToken, refreshToken } = await authService.refresh(token);
    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, { user, accessToken, refreshToken });
  }),
);

authRouter.post(
  "/logout",
  h(async (req, res) => {
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    await authService.logout(req.user?.id, cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    return ok(res, { loggedOut: true });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  h(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    return ok(res, user);
  }),
);

authRouter.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  h(async (req, res) => {
    const { currentPassword, newPassword } = getBody<{ currentPassword: string; newPassword: string }>(req);
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
    // Force a fresh session everywhere after a password change.
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    if (cookies?.[ACCESS_COOKIE]) clearAuthCookies(res);
    return ok(res, result);
  }),
);
