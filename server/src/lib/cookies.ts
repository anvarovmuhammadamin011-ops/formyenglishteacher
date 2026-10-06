import type { Response } from "express";
import { env, isProd } from "../config/env";
import { ttlToMs } from "./tokens";

export const ACCESS_COOKIE = "elms_at";
export const REFRESH_COOKIE = "elms_rt";

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const sameSite = env.COOKIE_SAMESITE;
  const secure = isProd && (env.COOKIE_SECURE || sameSite === "none");
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: ttlToMs(env.JWT_ACCESS_TTL),
    path: "/",
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: ttlToMs(env.JWT_REFRESH_TTL),
    path: "/api/auth",
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}
