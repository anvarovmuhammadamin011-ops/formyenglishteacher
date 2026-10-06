import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import type { Prisma, GroupStatus, Level } from "@prisma/client";

export type GroupListParams = {
  page: number;
  limit: number;
  search?: string;
  status?: GroupStatus;
  includeStats?: boolean;
};

export async function listGroups(params: GroupListParams) {
  const { page, limit, search, status, includeStats } = params;

  const where: Prisma.GroupWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        level: true,
        description: true,
        status: true,
        createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { members: { where: { student: { deletedAt: null } } } } },
      },
    }),
  ]);

  const items = rows.map((g) => ({
    id: g.id,
    name: g.name,
    level: g.level,
    description: g.description,
    status: g.status,
    createdAt: g.createdAt,
    teacher: g.createdBy ? `${g.createdBy.firstName} ${g.createdBy.lastName}` : null,
    studentCount: g._count.members,
  }));

  if (!includeStats) return { items, total };

  const stats = await Promise.all(
    items.map(async (item) => {
      const aggregate = await prisma.testAttempt.aggregate({
        where: {
          status: { in: ["SUBMITTED", "TIME_UP"] },
          user: { groupMemberships: { some: { groupId: item.id } } },
        },
        _avg: { percentage: true },
        _count: true,
      });
      return {
        ...item,
        averageScore: aggregate._avg.percentage ? Math.round(aggregate._avg.percentage * 10) / 10 : null,
        attemptsCount: aggregate._count,
      };
    }),
  );

  return { items: stats, total };
}

export async function getGroup(id: string, opts?: { includeStats?: boolean }) {
  const group = await prisma.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      level: true,
      description: true,
      status: true,
      createdAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      members: {
        where: { student: { deletedAt: null } },
        orderBy: { student: { firstName: "asc" } },
        select: {
          joinedAt: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              avatarUrl: true,
              status: true,
              studentProfile: { select: { level: true } },
              streak: { select: { currentStreak: true } },
            },
          },
        },
      },
      _count: { select: { assignments: true } },
    },
  });

  if (!group) throw ApiError.notFound("Group not found.");

  const students = group.members.map((m) => ({
    ...m.student,
    joinedAt: m.joinedAt,
    currentStreak: m.student.streak?.currentStreak ?? 0,
    streak: undefined,
  }));

  const base = {
    id: group.id,
    name: group.name,
    level: group.level,
    description: group.description,
    status: group.status,
    createdAt: group.createdAt,
    teacher: group.createdBy,
    studentCount: students.length,
    assignmentCount: group._count.assignments,
    students,
  };

  if (!opts?.includeStats) return base;

  const stats = await prisma.testAttempt.aggregate({
    where: {
      status: { in: ["SUBMITTED", "TIME_UP"] },
      user: { groupMemberships: { some: { groupId: id } } },
    },
    _avg: { percentage: true, durationSeconds: true },
    _count: true,
  });

  const assigned = await prisma.testAssignment.count({ where: { groupId: id } });
  const completedAttempts = await prisma.testAttempt.count({
    where: {
      assignment: { groupId: id },
      status: { in: ["SUBMITTED", "TIME_UP"] },
    },
  });

  return {
    ...base,
    stats: {
      averageScore: stats._avg.percentage ? Math.round(stats._avg.percentage * 10) / 10 : 0,
      averageDurationSeconds: stats._avg.durationSeconds ? Math.round(stats._avg.durationSeconds) : 0,
      attemptsCount: stats._count,
      assignmentsCount: assigned,
      completedAssignments: completedAttempts,
      completionRate: assigned ? Math.round((completedAttempts / Math.max(assigned, 1)) * 100) : 0,
    },
  };
}

export type CreateGroupInput = {
  name: string;
  level: Level;
  description?: string;
  studentIds?: string[];
};

export async function createGroup(input: CreateGroupInput, createdById: string) {
  const existing = await prisma.group.findFirst({
    where: { name: { equals: input.name.trim(), mode: "insensitive" }, status: "ACTIVE" },
  });
  if (existing) throw ApiError.conflict("A group with this name already exists.", { field: "name" });

  const group = await prisma.group.create({
    data: {
      name: input.name.trim(),
      level: input.level,
      description: input.description?.trim() || null,
      createdById,
      ...(input.studentIds?.length
        ? {
            members: {
              create: input.studentIds.map((studentId) => ({ studentId })),
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return getGroup(group.id, { includeStats: true });
}

export type UpdateGroupInput = Partial<{
  name: string;
  level: Level;
  description: string | null;
  status: GroupStatus;
}>;

export async function updateGroup(id: string, input: UpdateGroupInput) {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw ApiError.notFound("Group not found.");

  if (input.name && input.name.trim() !== group.name) {
    const clash = await prisma.group.findFirst({
      where: { name: { equals: input.name.trim(), mode: "insensitive" }, status: "ACTIVE", NOT: { id } },
    });
    if (clash) throw ApiError.conflict("A group with this name already exists.", { field: "name" });
  }

  await prisma.group.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return getGroup(id, { includeStats: true });
}

export async function deleteGroup(id: string) {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw ApiError.notFound("Group not found.");
  // Soft delete: archived groups stay in historical reports.
  await prisma.group.update({ where: { id }, data: { status: "ARCHIVED" } });
  return { id, status: "ARCHIVED" as const };
}

export async function addStudent(groupId: string, studentId: string) {
  const [group, student] = await Promise.all([
    prisma.group.findFirst({ where: { id: groupId, status: "ACTIVE" } }),
    prisma.user.findFirst({ where: { id: studentId, role: "STUDENT", deletedAt: null } }),
  ]);
  if (!group) throw ApiError.notFound("Group not found.");
  if (!student) throw ApiError.notFound("Student not found.");

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.deleteMany({ where: { studentId } });
    await tx.groupMember.upsert({
      where: { groupId_studentId: { groupId, studentId } },
      create: { groupId, studentId },
      update: {},
    });
  });

  return getGroup(groupId, { includeStats: false });
}

export async function removeStudent(groupId: string, studentId: string) {
  const membership = await prisma.groupMember.findFirst({ where: { groupId, studentId } });
  if (!membership) throw ApiError.notFound("Student is not a member of this group.");
  await prisma.groupMember.delete({ where: { id: membership.id } });
  return { groupId, studentId, removed: true };
}

export async function listGroupOptions() {
  return prisma.group.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, level: true, _count: { select: { members: { where: { student: { deletedAt: null } } } } } },
  });
}
