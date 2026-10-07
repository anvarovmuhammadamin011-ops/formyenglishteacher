import { z } from "zod";
import type { Ctx, Handler } from "@/lib/local/core";
import { fail, notFound, okList, page, qStr, unauthorized } from "@/lib/local/core";
import { hashPassword, mutate, nowIso, uid } from "@/lib/db";
import type { Db, DbUser, DbNotification, Level, Notification, StudentRow } from "@/lib/types";

const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

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

function requireTeacher(ctx: Ctx): DbUser {
  const user = ctx.requireTeacher();
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

function isActiveGroupMember(db: Db, studentId: string, groupId: string): boolean {
  const group = db.groups.find((g) => g.id === groupId && g.status === "ACTIVE");
  if (!group) return false;
  return db.groupMembers.some((m) => m.studentId === studentId && m.groupId === groupId);
}

function streakOf(db: Db, userId: string) {
  return db.streaks.find((s) => s.userId === userId);
}

type ListParams = {
  search?: string;
  groupId?: string;
  status?: "ACTIVE" | "INACTIVE";
  level?: Level;
  sort: "name" | "recent" | "streak";
};

function matchesList(db: Db, user: DbUser, params: ListParams): boolean {
  if (user.role !== "STUDENT" || user.deletedAt) return false;
  if (params.status && user.status !== params.status) return false;
  if (params.level && user.studentProfile?.level !== params.level) return false;
  if (params.groupId && !isActiveGroupMember(db, user.id, params.groupId)) return false;
  if (params.search) {
    const term = params.search.toLowerCase();
    const hit =
      user.firstName.toLowerCase().includes(term) ||
      user.lastName.toLowerCase().includes(term) ||
      user.username.toLowerCase().includes(term);
    if (!hit) return false;
  }
  return true;
}

function sortStudents(db: Db, rows: DbUser[], sort: ListParams["sort"]): DbUser[] {
  const copy = [...rows];
  if (sort === "recent") {
    copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else if (sort === "streak") {
    const value = (id: string) => streakOf(db, id)?.currentStreak ?? 0;
    copy.sort((a, b) => value(b.id) - value(a.id) || a.firstName.localeCompare(b.firstName));
  } else {
    copy.sort(
      (a, b) =>
        a.firstName.localeCompare(b.firstName) ||
        a.lastName.localeCompare(b.lastName) ||
        a.id.localeCompare(b.id),
    );
  }
  return copy;
}

function toStudentRow(db: Db, user: DbUser): StudentRow {
  const streak = streakOf(db, user.id);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    age: user.age,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    studentProfile: user.studentProfile ? { level: user.studentProfile.level } : null,
    streak: streak
      ? { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak }
      : null,
    group: activeGroup(db, user.id),
  };
}

function studentDetail(db: Db, id: string) {
  const user = db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
  if (!user) notFound("Student not found.");

  const testsById = new Map(db.tests.map((t) => [t.id, t]));
  const finished = db.attempts.filter(
    (a) =>
      a.userId === id &&
      (a.status === "SUBMITTED" || a.status === "TIME_UP") &&
      testsById.has(a.testId),
  );
  const attempts = [...finished]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 50)
    .map((a) => {
      const test = testsById.get(a.testId);
      return {
        id: a.id,
        percentage: a.percentage,
        score: a.score,
        totalPoints: a.totalPoints,
        durationSeconds: a.durationSeconds,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        status: a.status,
        test: test
          ? {
              id: test.id,
              title: test.title,
              topic: test.topic,
              skill: test.skill,
              difficulty: test.difficulty,
            }
          : undefined,
      };
    });

  const recent = attempts.filter((a) => a.test !== undefined);
  const avg = recent.length ? recent.reduce((sum, a) => sum + a.percentage, 0) / recent.length : 0;
  const best = recent.length ? Math.max(...recent.map((a) => a.percentage)) : 0;
  const totalSeconds = recent.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0);
  const streak = streakOf(db, id);

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    age: user.age,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    studentProfile: user.studentProfile ? { level: user.studentProfile.level } : null,
    streak: streak
      ? { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak }
      : null,
    group: activeGroup(db, id),
    stats: {
      testsCompleted: recent.length,
      averageScore: Math.round(avg * 10) / 10,
      bestScore: Math.round(best * 10) / 10,
      totalSeconds,
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
    },
    recentAttempts: recent,
    _count: {
      attempts: finished.length,
      activityLogs: db.activityLogs.filter((l) => l.userId === id).length,
    },
  };
}

function moveStudentToGroup(db: Db, studentId: string, groupId: string | null): void {
  if (groupId) {
    const group = db.groups.find((g) => g.id === groupId && g.status === "ACTIVE");
    if (!group) fail(400, "Target group not found.", "BAD_REQUEST");
  }
  for (let i = db.groupMembers.length - 1; i >= 0; i--) {
    if (db.groupMembers[i].studentId === studentId) db.groupMembers.splice(i, 1);
  }
  if (groupId) {
    db.groupMembers.push({ id: uid("mem"), groupId, studentId, joinedAt: nowIso() });
  }
}

function toNotification(row: DbNotification): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function fileField(body: unknown): Blob | null {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entry = body.get("avatar");
    return entry instanceof Blob ? entry : null;
  }
  if (body && typeof body === "object") {
    const entry = (body as Record<string, unknown>).avatar;
    return entry instanceof Blob ? entry : null;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const levelEnum = z.enum([
  "BEGINNER",
  "ELEMENTARY",
  "PRE_INTERMEDIATE",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
]);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  groupId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  level: levelEnum.optional(),
  sort: z.enum(["name", "recent", "streak"]).default("name"),
});

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Only letters, numbers, dots, dashes and underscores are allowed",
    ),
  password: z.string().min(6).max(72),
  age: z.coerce.number().int().min(5).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  groupId: z.string().optional(),
  level: levelEnum.optional(),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  age: z.coerce.number().int().min(5).max(100).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  level: levelEnum.optional(),
  groupId: z.string().nullable().optional(),
});

const passwordSchema = z.object({ password: z.string().min(6).max(72) });

export const usersRoutes: Record<string, Handler> = {
  "GET /students": (ctx) => {
    requireTeacher(ctx);
    const q = parse(listQuery, ctx.query);
    const rows = ctx.db.users.filter((u) => matchesList(ctx.db, u, q));
    const sorted = sortStudents(ctx.db, rows, q.sort);
    const skip = (q.page - 1) * q.limit;
    const items = sorted.slice(skip, skip + q.limit).map((u) => toStudentRow(ctx.db, u));
    return okList(items, rows.length, { page: q.page, limit: q.limit, skip, take: q.limit });
  },

  "GET /students/options": (ctx) => {
    requireTeacher(ctx);
    const rows = ctx.db.users.filter((u) => u.role === "STUDENT" && !u.deletedAt);
    return sortStudents(ctx.db, rows, "name")
      .slice(0, 100)
      .map((u) => ({
        id: u.id,
        label: `${u.firstName} ${u.lastName}`,
        group: activeGroup(ctx.db, u.id),
        status: u.status,
      }));
  },

  "POST /students": async (ctx) => {
    requireTeacher(ctx);
    const input = parse(createSchema, ctx.body);
    const username = input.username.toLowerCase();
    if (ctx.db.users.some((u) => u.username === username)) {
      fail(409, "This username is already taken.", "CONFLICT", { field: "username" });
    }
    if (input.groupId) {
      const group = ctx.db.groups.find((g) => g.id === input.groupId && g.status === "ACTIVE");
      if (!group) fail(400, "Group not found.", "BAD_REQUEST");
    }
    const passwordHash = await hashPassword(input.password);
    const id = mutate((db) => {
      const now = nowIso();
      const user: DbUser = {
        id: uid("usr"),
        role: "STUDENT",
        firstName: input.firstName,
        lastName: input.lastName,
        username,
        passwordHash,
        avatarUrl: null,
        phone: input.phone || null,
        age: input.age ?? null,
        status: "ACTIVE",
        lastLoginAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        studentProfile: { level: input.level ?? "BEGINNER", bio: null, joinedAt: now },
        teacherProfile: null,
      };
      db.users.push(user);
      if (input.groupId) {
        db.groupMembers.push({
          id: uid("mem"),
          groupId: input.groupId,
          studentId: user.id,
          joinedAt: now,
        });
      }
      db.notifications.push({
        id: uid("ntf"),
        userId: user.id,
        type: "GENERAL",
        title: "Welcome to ELMS 🎓",
        body: "Your account has been created. Check your assigned tests from the Tests tab.",
        link: "/student/tests",
        readAt: null,
        createdAt: now,
      });
      return user.id;
    });
    return studentDetail(ctx.db, id);
  },

  "PATCH /students/:id": async (ctx) => {
    requireTeacher(ctx);
    const id = ctx.params.id;
    const input = parse(updateSchema, ctx.body);
    const existing = ctx.db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
    if (!existing) notFound("Student not found.");
    if (input.groupId !== undefined && input.groupId) {
      const group = ctx.db.groups.find(
        (g) => g.id === input.groupId && g.status === "ACTIVE",
      );
      if (!group) fail(400, "Target group not found.", "BAD_REQUEST");
    }
    mutate((db) => {
      const target = db.users.find((u) => u.id === id);
      if (!target) return;
      if (input.firstName !== undefined) target.firstName = input.firstName;
      if (input.lastName !== undefined) target.lastName = input.lastName;
      if (input.age !== undefined) target.age = input.age;
      if (input.phone !== undefined) target.phone = input.phone || null;
      if (input.status !== undefined) target.status = input.status;
      if (input.level !== undefined) {
        if (target.studentProfile) {
          target.studentProfile.level = input.level;
        } else {
          target.studentProfile = { level: input.level, bio: null, joinedAt: nowIso() };
        }
      }
      target.updatedAt = nowIso();
      if (input.groupId !== undefined) moveStudentToGroup(db, id, input.groupId);
    });
    return studentDetail(ctx.db, id);
  },

  "POST /students/:id/status": (ctx) => {
    requireTeacher(ctx);
    const id = ctx.params.id;
    const status = mutate((db) => {
      const target = db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
      if (!target) notFound("Student not found.");
      target.status = target.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      target.updatedAt = nowIso();
      return target.status;
    });
    return { id, status };
  },

  "POST /students/:id/password": async (ctx) => {
    requireTeacher(ctx);
    const id = ctx.params.id;
    const input = parse(passwordSchema, ctx.body);
    const existing = ctx.db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
    if (!existing) notFound("Student not found.");
    const passwordHash = await hashPassword(input.password);
    mutate((db) => {
      const target = db.users.find((u) => u.id === id);
      if (!target) return;
      target.passwordHash = passwordHash;
      target.updatedAt = nowIso();
    });
    return { id, passwordReset: true };
  },

  "DELETE /students/:id": (ctx) => {
    requireTeacher(ctx);
    const id = ctx.params.id;
    mutate((db) => {
      const target = db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
      if (!target) notFound("Student not found.");
      const now = nowIso();
      target.deletedAt = now;
      target.status = "INACTIVE";
      target.updatedAt = now;
    });
    return { id, deleted: true };
  },

  "GET /groups/options": (ctx) => {
    requireTeacher(ctx);
    const users = ctx.db.users;
    return ctx.db.groups
      .filter((g) => g.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        _count: {
          members: ctx.db.groupMembers.filter(
            (m) => m.groupId === g.id && users.some((u) => u.id === m.studentId && !u.deletedAt),
          ).length,
        },
      }));
  },

  "GET /notifications": (ctx) => {
    const user = requireActive(ctx);
    const pg = page(ctx, 20, 100);
    const unreadOnly = qStr(ctx, "unread") === "true";
    const mine = ctx.db.notifications.filter((n) => n.userId === user.id);
    const visible = unreadOnly ? mine.filter((n) => !n.readAt) : mine;
    const items = [...visible]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(pg.skip, pg.skip + pg.take)
      .map(toNotification);
    return {
      items,
      total: visible.length,
      unread: mine.filter((n) => !n.readAt).length,
    };
  },

  "POST /notifications/:id/read": (ctx) => {
    const user = requireActive(ctx);
    const id = ctx.params.id;
    const readAt = mutate((db) => {
      const target = db.notifications.find((n) => n.id === id && n.userId === user.id);
      if (!target) notFound("Notification not found.");
      if (!target.readAt) target.readAt = nowIso();
      return target.readAt;
    });
    return { id, readAt };
  },

  "POST /notifications/read-all": (ctx) => {
    const user = requireActive(ctx);
    const updated = mutate((db) => {
      const now = nowIso();
      let count = 0;
      for (const n of db.notifications) {
        if (n.userId === user.id && !n.readAt) {
          n.readAt = now;
          count++;
        }
      }
      return count;
    });
    return { updated };
  },

  "POST /profile/avatar": async (ctx) => {
    const user = requireActive(ctx);
    const file = fileField(ctx.body);
    if (!file) fail(400, "Attach an image as multipart field 'avatar'.", "BAD_REQUEST");
    if (!AVATAR_TYPES.has(file.type)) {
      fail(400, "Only JPEG, PNG, WebP or GIF images are allowed (max 2 MB).", "BAD_REQUEST");
    }
    if (file.size > AVATAR_MAX_BYTES) {
      fail(400, "Only JPEG, PNG, WebP or GIF images are allowed (max 2 MB).", "BAD_REQUEST");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const avatarUrl = `data:${file.type};base64,${toBase64(bytes)}`;
    mutate((db) => {
      const target = db.users.find((u) => u.id === user.id);
      if (!target) return;
      target.avatarUrl = avatarUrl;
      target.updatedAt = nowIso();
    });
    return { avatarUrl };
  },

  "DELETE /profile/avatar": (ctx) => {
    const user = requireActive(ctx);
    mutate((db) => {
      const target = db.users.find((u) => u.id === user.id);
      if (!target) return;
      target.avatarUrl = null;
      target.updatedAt = nowIso();
    });
    return { avatarUrl: null };
  },
};
