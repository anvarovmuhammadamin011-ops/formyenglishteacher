import { z } from "zod";
import type { Ctx, Handler } from "@/lib/local/core";
import { fail, forbidden, unauthorized } from "@/lib/local/core";
import { hashPassword, logActivity, mutate, nowIso, uid, verifyPassword } from "@/lib/db";
import type { Db, DbUser, Level, SessionUser } from "@/lib/types";

function toIssues(error: unknown): Array<{ path: string; message: string }> {
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return (issues as unknown[]).map((issue) => {
    const raw = issue as { path?: unknown; message?: unknown };
    const path = Array.isArray(raw.path) ? raw.path.map((part) => String(part)).join(".") : "";
    return { path, message: typeof raw.message === "string" ? raw.message : "Invalid value" };
  });
}

function parse<S extends z.ZodType<any, any>>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    fail(422, "Please check the highlighted fields.", "VALIDATION_ERROR", toIssues(result.error));
  }
  return result.data;
}

function requireActive(ctx: Ctx): DbUser {
  const user = ctx.requireUser();
  if (user.status !== "ACTIVE") unauthorized("This account is no longer active.");
  return user;
}

function activeGroup(db: Db, userId: string): { id: string; name: string; level: Level } | null {
  let group: { id: string; name: string; level: Level } | null = null;
  let joinedAt = "";
  for (const member of db.groupMembers) {
    if (member.studentId !== userId) continue;
    const found = db.groups.find((g) => g.id === member.groupId);
    if (!found || found.status !== "ACTIVE") continue;
    if (!group || member.joinedAt > joinedAt) {
      group = { id: found.id, name: found.name, level: found.level };
      joinedAt = member.joinedAt;
    }
  }
  return group;
}

function sessionUser(db: Db, user: DbUser): SessionUser {
  return {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    status: user.status,
    phone: user.phone,
    age: user.age,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    studentProfile: user.studentProfile
      ? { level: user.studentProfile.level, bio: user.studentProfile.bio }
      : null,
    teacherProfile: user.teacherProfile
      ? { subject: user.teacherProfile.subject, bio: user.teacherProfile.bio }
      : null,
    group: activeGroup(db, user.id),
  };
}

const loginSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(72),
});

export const authRoutes: Record<string, Handler> = {
  "POST /auth/login": async (ctx) => {
    const input = parse(loginSchema, ctx.body);
    const username = input.username.toLowerCase();
    const found = ctx.db.users.find((u) => u.username === username);
    if (!found || found.deletedAt) unauthorized("Invalid username or password.");
    if (!(await verifyPassword(input.password, found.passwordHash))) {
      unauthorized("Invalid username or password.");
    }
    if (found.status !== "ACTIVE") forbidden("This account is deactivated. Contact your teacher.");
    const user = mutate((db) => {
      const target = db.users.find((u) => u.id === found.id);
      if (!target) unauthorized("Invalid username or password.");
      target.lastLoginAt = nowIso();
      logActivity(db, target.id, "LOGIN");
      db.sessionUserId = target.id;
      return sessionUser(db, target);
    });
    return { user, accessToken: uid("at"), refreshToken: uid("rt") };
  },

  "POST /auth/refresh": (ctx) => {
    const id = ctx.db.sessionUserId;
    const user = id ? ctx.db.users.find((u) => u.id === id) : undefined;
    if (!user || user.deletedAt) unauthorized("Your session has expired. Please sign in again.");
    if (user.status !== "ACTIVE") unauthorized("This account is no longer active.");
    return {
      user: sessionUser(ctx.db, user),
      accessToken: uid("at"),
      refreshToken: uid("rt"),
    };
  },

  "POST /auth/logout": (ctx) => {
    const current = ctx.user;
    mutate((db) => {
      if (current) logActivity(db, current.id, "LOGOUT");
      db.sessionUserId = null;
    });
    return { loggedOut: true };
  },

  "GET /auth/me": (ctx) => sessionUser(ctx.db, requireActive(ctx)),

  "POST /auth/change-password": async (ctx) => {
    const user = requireActive(ctx);
    const input = parse(changePasswordSchema, ctx.body);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      fail(400, "Current password is incorrect.", "BAD_REQUEST");
    }
    const passwordHash = await hashPassword(input.newPassword);
    mutate((db) => {
      const target = db.users.find((u) => u.id === user.id);
      if (!target) return;
      target.passwordHash = passwordHash;
      target.updatedAt = nowIso();
    });
    return { reset: true };
  },
};
