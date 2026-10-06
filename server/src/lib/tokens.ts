import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../config/env";

export type AccessPayload = {
  sub: string;
  role: "TEACHER" | "STUDENT";
  type: "access";
};

export type RefreshPayload = {
  sub: string;
  type: "refresh";
  jti: string;
};

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: Omit<AccessPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  if (decoded.type !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "refresh", jti: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions,
  );
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  if (decoded.type !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

/** Refresh tokens are stored hashed so a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 15 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const factor = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * factor;
}
