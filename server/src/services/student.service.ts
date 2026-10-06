import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { hashPassword, hashToken, signAccessToken, signRefreshToken } from "../lib/tokens";
import type { Prisma, Role, UserStatus, Level } from "@prisma/client";

export type StudentListParams = {
  page: number;
  limit: number;
  search?: string;
  groupId?: string;
  status?: UserStatus;
  level?: Level;
  sort?: "name" | "recent" | "streak";
};

const baseSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  age: true,
  phone: true,
  avatarUrl: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  studentProfile: { select: { level: true } },
  groupMemberships: {
    select: { group: { select: { id: true, name: true, level: true } } },
    where: { group: { status: "ACTIVE" as const } },
    orderBy: { joinedAt: "desc" as const },
    take: 1,
  },
  streak: { select: { currentStreak: true, longestStreak: true } },
} satisfies Prisma.UserSelect;

function decorate<T extends {
  groupMemberships?: Array<{ group: { id: string; name: string; level: Level } }>;
}>(user: T) {
  const { groupMemberships, ...rest } = user;
  return { ...rest, group: groupMemberships?.[0]?.group ?? null };
}

export async function listStudents(params: StudentListParams) {
  const { page, limit, search, groupId, status, level, sort } = params;

  const where: Prisma.UserWhereInput = {
    role: "STUDENT",
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(level ? { studentProfile: { level } } : {}),
    ...(groupId
      ? { groupMemberships: { some: { groupId, group: { status: "ACTIVE" } } } }
      : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "recent" ? { createdAt: "desc" } : sort === "streak" ? { streak: { currentStreak: "desc" } } : { firstName: "asc" };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: baseSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items: rows.map(decorate), total };
}

export async function getStudent(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: {
      ...baseSelect,
      createdAt: true,
      updatedAt: true,
      attempts: {
        where: { status: { in: ["SUBMITTED", "TIME_UP"] } },
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          percentage: true,
          score: true,
          totalPoints: true,
          durationSeconds: true,
          startedAt: true,
          submittedAt: true,
          status: true,
          test: { select: { id: true, title: true, topic: true, skill: true, difficulty: true } },
        },
      },
      _count: {
        select: {
          attempts: { where: { status: { in: ["SUBMITTED", "TIME_UP"] } } },
          activityLogs: true,
        },
      },
    },
  });

  if (!user) throw ApiError.notFound("Student not found.");

  const attempts = user.attempts;
  const avg = attempts.length
    ? attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length
    : 0;
  const totalTime = attempts.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0);
  const best = attempts.length ? Math.max(...attempts.map((a) => a.percentage)) : 0;

  return {
    ...decorate(user),
    stats: {
      testsCompleted: attempts.length,
      averageScore: Math.round(avg * 10) / 10,
      bestScore: Math.round(best * 10) / 10,
      totalSeconds: totalTime,
      currentStreak: user.streak?.currentStreak ?? 0,
      longestStreak: user.streak?.longestStreak ?? 0,
    },
    recentAttempts: attempts,
  };
}

export type CreateStudentInput = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  age?: number;
  phone?: string;
  groupId?: string;
  level?: Level;
};

export async function createStudent(input: CreateStudentInput) {
  const username = input.username.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw ApiError.conflict("This username is already taken.", { field: "username" });

  if (input.groupId) {
    const group = await prisma.group.findFirst({ where: { id: input.groupId, status: "ACTIVE" } });
    if (!group) throw ApiError.badRequest("Group not found.");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      role: "STUDENT",
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username,
      passwordHash,
      age: input.age,
      phone: input.phone?.trim() || null,
      studentProfile: { create: { level: input.level ?? "BEGINNER" } },
      ...(input.groupId ? { groupMemberships: { create: { groupId: input.groupId } } } : {}),
      notifications: {
        create: {
          type: "GENERAL",
          title: "Welcome to ELMS 🎓",
          body: "Your account has been created. Check your assigned tests from the Tests tab.",
          link: "/student/tests",
        },
      },
    },
    select: { id: true },
  });

  return getStudent(user.id);
}

export type UpdateStudentInput = Partial<{
  firstName: string;
  lastName: string;
  age: number | null;
  phone: string | null;
  status: UserStatus;
  level: Level;
  groupId: string | null;
}>;

export async function updateStudent(id: string, input: UpdateStudentInput) {
  const existing = await prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
  if (!existing) throw ApiError.notFound("Student not found.");

  const data: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName.trim();
  if (input.age !== undefined) data.age = input.age;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.status !== undefined) data.status = input.status;
  if (input.level !== undefined) {
    data.studentProfile = {
      upsert: { create: { level: input.level }, update: { level: input.level } },
    };
  }

  await prisma.user.update({ where: { id }, data });

  if (input.groupId !== undefined) {
    await moveStudentToGroup(id, input.groupId);
  }

  return getStudent(id);
}

export async function deactivateStudent(id: string) {
  const existing = await prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
  if (!existing) throw ApiError.notFound("Student not found.");
  await prisma.user.update({
    where: { id },
    data: { status: existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", refreshTokenHash: null },
  });
  return { id, status: existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" };
}

export async function deleteStudent(id: string) {
  const existing = await prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
  if (!existing) throw ApiError.notFound("Student not found.");
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE", refreshTokenHash: null },
  });
  return { id, deleted: true };
}

export async function resetStudentPassword(id: string, password: string) {
  const existing = await prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
  if (!existing) throw ApiError.notFound("Student not found.");
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), refreshTokenHash: null },
  });
  return { id, passwordReset: true };
}

export async function moveStudentToGroup(studentId: string, groupId: string | null) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", deletedAt: null },
  });
  if (!student) throw ApiError.notFound("Student not found.");

  if (groupId) {
    const group = await prisma.group.findFirst({ where: { id: groupId, status: "ACTIVE" } });
    if (!group) throw ApiError.badRequest("Target group not found.");
  }

  await prisma.$transaction(async (tx) => {
    if (groupId) {
      // A student belongs to a single active group at a time.
      await tx.groupMember.deleteMany({ where: { studentId } });
      await tx.groupMember.upsert({
        where: { groupId_studentId: { groupId, studentId } },
        create: { groupId, studentId },
        update: {},
      });
    } else {
      await tx.groupMember.deleteMany({ where: { studentId } });
    }
  });

  return { studentId, groupId };
}

/** Creates a login payload without going through the login form (used by seed/tools). */
export async function issueTokens(userId: string) {
  const accessToken = signAccessToken({ sub: userId, role: "STUDENT" });
  const refreshToken = signRefreshToken(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });
  return { accessToken, refreshToken };
}

export type { Role };
