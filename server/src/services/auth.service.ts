import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { hashPassword, hashToken, signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from "../lib/tokens";
import type { AuthUser } from "../types/express";

const userSelect = {
  id: true,
  role: true,
  status: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarUrl: true,
} as const;

export function toAuthUser(user: {
  id: string;
  role: AuthUser["role"];
  status: AuthUser["status"];
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
}): AuthUser {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

export async function login(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: normalized } });

  const invalid = ApiError.unauthorized("Invalid username or password.");
  if (!user || user.deletedAt) throw invalid;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw invalid;

  if (user.status !== "ACTIVE") {
    throw ApiError.forbidden("This account is deactivated. Contact your teacher.");
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  await Promise.all([
    prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashToken(refreshToken), lastLoginAt: new Date() },
    }),
    prisma.activityLog.create({ data: { userId: user.id, type: "LOGIN" } }),
  ]);

  return { user: toAuthUser(user), accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    throw ApiError.unauthorized("This account is no longer active.");
  }

  // Token rotation: a refresh token that does not match the stored hash is rejected.
  if (!user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
    await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const newRefreshToken = signRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: hashToken(newRefreshToken) },
  });

  return { user: toAuthUser(user), accessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string | undefined, refreshToken: string | undefined) {
  if (userId) {
    await Promise.all([
      prisma.user.updateMany({ where: { id: userId }, data: { refreshTokenHash: null } }),
      prisma.activityLog.create({ data: { userId, type: "LOGOUT" } }),
    ]);
  }
  return { refreshToken };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      age: true,
      phone: true,
      createdAt: true,
      lastLoginAt: true,
      studentProfile: { select: { level: true, bio: true, joinedAt: true } },
      teacherProfile: { select: { subject: true, bio: true } },
      groupMemberships: {
        where: { group: { status: "ACTIVE" } },
        select: { group: { select: { id: true, name: true, level: true } } },
        orderBy: { joinedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!user) throw ApiError.notFound("Account not found.");

  const group = user.groupMemberships[0]?.group ?? null;
  const { groupMemberships: _m, ...rest } = user;
  return { ...rest, group };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("Account not found.");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest("Current password is incorrect.");

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      refreshTokenHash: null,
    },
  });

  return { reset: true };
}
