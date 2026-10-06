import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { notify } from "./system.service";
import type { Prisma, QuestionType, Level, Skill, TestStatus, TestType } from "@prisma/client";

export type QuestionInput = {
  type: QuestionType;
  text: string;
  topic?: string;
  explanation?: string;
  correctAnswer?: string;
  points?: number;
  options: Array<{ text: string; isCorrect: boolean }>;
};

export type CreateTestInput = {
  title: string;
  description?: string;
  topic?: string;
  skill?: Skill;
  difficulty?: Level;
  timeLimitSeconds?: number;
  passingScore?: number;
  instructions?: string;
  status?: TestStatus;
  type?: TestType;
  aiPrompt?: string;
  questions: QuestionInput[];
};

function normalizeQuestions(questions: QuestionInput[]): QuestionInput[] {
  return questions.map((q, index) => {
    const base = {
      ...q,
      points: q.points ?? 1,
      topic: q.topic?.trim() || undefined,
      explanation: q.explanation?.trim() || undefined,
      correctAnswer: q.correctAnswer?.trim() || undefined,
      _order: index,
    };

    if (q.type === "TRUE_FALSE") {
      const derived = q.correctAnswer ?? q.options.find((o) => o.isCorrect)?.text ?? "true";
      const correct = /^(t|true|ha|to'g'ri)/i.test(derived.trim());
      return {
        ...base,
        correctAnswer: correct ? "true" : "false",
        options: [
          { text: "True", isCorrect: correct },
          { text: "False", isCorrect: !correct },
        ],
      };
    }

    return {
      ...base,
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    };
  });
}

export async function createTest(input: CreateTestInput, createdById: string) {
  if (!input.questions?.length) throw ApiError.badRequest("A test needs at least one question.");

  const questions = normalizeQuestions(input.questions);

  const test = await prisma.test.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      topic: input.topic?.trim() || null,
      skill: input.skill ?? "GRAMMAR",
      difficulty: input.difficulty ?? "BEGINNER",
      timeLimitSeconds: input.timeLimitSeconds ?? Math.max(60, input.questions.length * 60),
      passingScore: input.passingScore ?? 60,
      instructions: input.instructions?.trim() || null,
      status: input.status ?? "DRAFT",
      type: input.type ?? "MANUAL",
      aiPrompt: input.aiPrompt ?? null,
      createdById,
      questions: {
        create: questions.map((q, idx) => ({
          type: q.type,
          text: q.text,
          topic: q.topic ?? null,
          explanation: q.explanation ?? null,
          correctAnswer: q.correctAnswer ?? null,
          order: idx,
          points: q.points ?? 1,
          options: {
            create: q.options.map((o, oi) => ({ text: o.text, isCorrect: o.isCorrect, order: oi })),
          },
        })),
      },
    },
  });

  return getTest(test.id);
}

export type UpdateTestInput = Partial<Omit<CreateTestInput, "questions">> & {
  questions?: QuestionInput[];
};

export async function updateTest(id: string, input: UpdateTestInput) {
  const test = await prisma.test.findFirst({ where: { id, deletedAt: null } });
  if (!test) throw ApiError.notFound("Test not found.");

  const data: Prisma.TestUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.topic !== undefined) data.topic = input.topic?.trim() || null;
  if (input.skill !== undefined) data.skill = input.skill;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty;
  if (input.timeLimitSeconds !== undefined) data.timeLimitSeconds = input.timeLimitSeconds;
  if (input.passingScore !== undefined) data.passingScore = input.passingScore;
  if (input.instructions !== undefined) data.instructions = input.instructions?.trim() || null;
  if (input.status !== undefined) data.status = input.status;

  if (input.questions) {
    if (!input.questions.length) throw ApiError.badRequest("A test needs at least one question.");
    const questions = normalizeQuestions(input.questions);
    data.questions = {
      deleteMany: {},
      create: questions.map((q, idx) => ({
        type: q.type,
        text: q.text,
        topic: q.topic ?? null,
        explanation: q.explanation ?? null,
        correctAnswer: q.correctAnswer ?? null,
        order: idx,
        points: q.points ?? 1,
        options: {
          create: q.options.map((o, oi) => ({ text: o.text, isCorrect: o.isCorrect, order: oi })),
        },
      })),
    };
  }

  await prisma.test.update({ where: { id }, data });
  return getTest(id);
}

export async function deleteTest(id: string) {
  const test = await prisma.test.findFirst({ where: { id, deletedAt: null } });
  if (!test) throw ApiError.notFound("Test not found.");
  await prisma.test.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  return { id, deleted: true };
}

const testWithQuestions = {
  id: true,
  title: true,
  description: true,
  topic: true,
  skill: true,
  difficulty: true,
  timeLimitSeconds: true,
  passingScore: true,
  instructions: true,
  type: true,
  status: true,
  aiPrompt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  questions: {
    orderBy: { order: "asc" as const },
    include: { options: { orderBy: { order: "asc" as const } } },
  },
  assignments: {
    include: {
      group: { select: { id: true, name: true, level: true } },
      _count: { select: { attempts: { where: { status: { in: ["SUBMITTED" as const, "TIME_UP" as const] } } } } },
    },
  },
  _count: { select: { questions: true, attempts: true } },
} satisfies Prisma.TestSelect;

export async function getTest(id: string) {
  const test = await prisma.test.findFirst({
    where: { id, deletedAt: null },
    select: testWithQuestions,
  });
  if (!test) throw ApiError.notFound("Test not found.");
  return test;
}

export async function listTests(params: {
  page: number;
  limit: number;
  search?: string;
  status?: TestStatus;
  skill?: Skill;
  type?: TestType;
  groupId?: string;
}) {
  const { page, limit, search, status, skill, type, groupId } = params;

  const where: Prisma.TestWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(skill ? { skill } : {}),
    ...(type ? { type } : {}),
    ...(groupId ? { assignments: { some: { groupId } } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { topic: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.test.count({ where }),
    prisma.test.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        topic: true,
        skill: true,
        difficulty: true,
        type: true,
        status: true,
        timeLimitSeconds: true,
        passingScore: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { questions: true, attempts: { where: { status: { in: ["SUBMITTED", "TIME_UP"] } } } } },
        assignments: { select: { groupId: true, group: { select: { name: true } } } },
      },
    }),
  ]);

  return { items, total };
}

// ── Assignment ──────────────────────────────────────────────────────

export type AssignInput = {
  groupIds: string[];
  startAt: string | Date;
  deadlineAt: string | Date;
  durationSeconds?: number;
  maxAttempts?: number;
};

export async function assignTest(testId: string, input: AssignInput, assignedById: string) {
  const test = await prisma.test.findFirst({ where: { id: testId, deletedAt: null } });
  if (!test) throw ApiError.notFound("Test not found.");

  const startAt = new Date(input.startAt);
  const deadlineAt = new Date(input.deadlineAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(deadlineAt.getTime())) {
    throw ApiError.badRequest("Invalid date.");
  }
  if (deadlineAt <= startAt) throw ApiError.badRequest("The deadline must be after the start time.");
  if (!input.groupIds.length) throw ApiError.badRequest("Select at least one group.");

  const groups = await prisma.group.findMany({
    where: { id: { in: input.groupIds }, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (groups.length !== input.groupIds.length) {
    throw ApiError.badRequest("One or more groups could not be found.");
  }

  if (test.status === "DRAFT") {
    await prisma.test.update({ where: { id: testId }, data: { status: "PUBLISHED" } });
  }

  const results = await prisma.$transaction(
    input.groupIds.map((groupId) =>
      prisma.testAssignment.upsert({
        where: { testId_groupId: { testId, groupId } },
        create: {
          testId,
          groupId,
          assignedById,
          startAt,
          deadlineAt,
          durationSeconds: input.durationSeconds ?? test.timeLimitSeconds,
          maxAttempts: input.maxAttempts ?? 1,
          status: "ACTIVE",
        },
        update: {
          startAt,
          deadlineAt,
          durationSeconds: input.durationSeconds ?? test.timeLimitSeconds,
          maxAttempts: input.maxAttempts ?? 1,
          status: "ACTIVE",
          assignedById,
        },
      }),
    ),
  );

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
      groupMemberships: { some: { groupId: { in: input.groupIds } } },
    },
    select: { id: true },
  });

  await notify(
    students.map((s) => s.id),
    {
      type: "TEST_ASSIGNED",
      title: `New test: ${test.title}`,
      body: `${groups.map((g) => g.name).join(", ")} • due ${deadlineAt.toLocaleString()}`,
      link: "/student/tests",
    },
  );

  return results;
}

export async function unassignTest(testId: string, groupId: string) {
  const assignment = await prisma.testAssignment.findUnique({
    where: { testId_groupId: { testId, groupId } },
  });
  if (!assignment) throw ApiError.notFound("Assignment not found.");
  await prisma.testAssignment.update({
    where: { id: assignment.id },
    data: { status: "CLOSED" },
  });
  return { testId, groupId, closed: true };
}

export async function listAssignments(params: {
  page: number;
  limit: number;
  groupId?: string;
  testId?: string;
  upcoming?: boolean;
}) {
  const where: Prisma.TestAssignmentWhereInput = {
    ...(params.groupId ? { groupId: params.groupId } : {}),
    ...(params.testId ? { testId: params.testId } : {}),
    ...(params.upcoming ? { deadlineAt: { gte: new Date() } } : {}),
    status: "ACTIVE",
  };

  const [total, items] = await Promise.all([
    prisma.testAssignment.count({ where }),
    prisma.testAssignment.findMany({
      where,
      orderBy: { deadlineAt: "asc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: {
        test: { select: { id: true, title: true, topic: true, difficulty: true, timeLimitSeconds: true } },
        group: { select: { id: true, name: true, level: true } },
        assignedBy: { select: { firstName: true, lastName: true } },
        _count: {
          select: {
            attempts: { where: { status: { in: ["SUBMITTED", "TIME_UP"] } } },
          },
        },
      },
    }),
  ]);

  const decorated = await Promise.all(
    items.map(async (a) => {
      const studentCount = await prisma.groupMember.count({
        where: { groupId: a.groupId, student: { deletedAt: null } },
      });
      return {
        id: a.id,
        test: a.test,
        group: a.group,
        assignedBy: a.assignedBy,
        startAt: a.startAt,
        deadlineAt: a.deadlineAt,
        durationSeconds: a.durationSeconds,
        maxAttempts: a.maxAttempts,
        status: a.status,
        completedCount: a._count.attempts,
        studentCount,
        completionRate: studentCount ? Math.round((a._count.attempts / studentCount) * 100) : 0,
      };
    }),
  );

  return { items: decorated, total };
}

// ── Per-test results & question analysis ─────────────────────────────

export async function getTestResults(testId: string, filters?: { groupId?: string }) {
  const test = await prisma.test.findFirst({
    where: { id: testId, deletedAt: null },
    select: { id: true, title: true, topic: true, difficulty: true, passingScore: true, status: true },
  });
  if (!test) throw ApiError.notFound("Test not found.");

  const assignments = await prisma.testAssignment.findMany({
    where: { testId, ...(filters?.groupId ? { groupId: filters.groupId } : {}) },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { deadlineAt: "asc" },
  });

  const groupIds = assignments.map((a) => a.groupId);
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      deletedAt: null,
      groupMemberships: { some: { groupId: { in: groupIds } } },
    },
    select: { id: true },
  });
  const assignedStudentCount = new Set(students.map((s) => s.id)).size;

  const attempts = await prisma.testAttempt.findMany({
    where: {
      testId,
      status: { in: ["SUBMITTED", "TIME_UP"] },
      ...(groupIds.length ? { assignment: { groupId: { in: groupIds } } } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
      assignment: { select: { group: { select: { id: true, name: true } } } },
    },
    orderBy: { percentage: "desc" },
  });

  const inProgress = await prisma.testAttempt.count({
    where: { testId, status: "IN_PROGRESS" },
  });

  const completedIds = new Set(attempts.map((a) => a.user.id));
  const avg = attempts.length ? attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length : 0;
  const avgDuration = attempts.length
    ? attempts.reduce((s, a) => s + (a.durationSeconds ?? 0), 0) / attempts.length
    : 0;
  const passed = attempts.filter((a) => a.percentage >= test.passingScore).length;

  // Question-level analysis: which questions do students miss?
  const questions = await prisma.question.findMany({
    where: { testId },
    include: { options: true, answers: true },
    orderBy: { order: "asc" },
  });

  const questionAnalysis = questions.map((q) => {
    const answered = q.answers.filter((a) => a.isCorrect !== null);
    const correct = q.answers.filter((a) => a.isCorrect === true).length;
    const timesAsked = attempts.length;
    return {
      id: q.id,
      order: q.order,
      text: q.text,
      type: q.type,
      topic: q.topic,
      correctCount: correct,
      answeredCount: answered.length,
      attemptCount: timesAsked,
      correctPct: timesAsked ? Math.round((correct / timesAsked) * 100) : 0,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        chosenCount: q.answers.filter((a) => a.selectedOptionIds.includes(o.id)).length,
      })),
    };
  });

  return {
    test,
    summary: {
      assignedStudents: assignedStudentCount,
      completed: attempts.length,
      inProgress,
      notStarted: Math.max(0, assignedStudentCount - attempts.length - inProgress),
      average: Math.round(avg * 10) / 10,
      highest: attempts.length ? Math.max(...attempts.map((a) => a.percentage)) : 0,
      lowest: attempts.length ? Math.min(...attempts.map((a) => a.percentage)) : 0,
      averageDurationSeconds: Math.round(avgDuration),
      passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : 0,
    },
    assignments: assignments.map((a) => ({
      id: a.id,
      group: a.group,
      startAt: a.startAt,
      deadlineAt: a.deadlineAt,
      durationSeconds: a.durationSeconds,
      status: a.status,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      student: a.user,
      group: a.assignment?.group ?? null,
      score: a.score,
      totalPoints: a.totalPoints,
      percentage: a.percentage,
      durationSeconds: a.durationSeconds,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      status: a.status,
      tabSwitches: a.tabSwitches,
      refreshCount: a.refreshCount,
    })),
    questionAnalysis,
  };
}
