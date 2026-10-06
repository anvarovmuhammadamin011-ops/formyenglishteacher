import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { gradeAttempt } from "../lib/grading";
import { logActivity, notify, recordMeaningfulActivity } from "./system.service";
import type { ActivityType, Prisma, Question, QuestionOption, TestAttempt } from "@prisma/client";

const GRACE_SECONDS = 15;

export type AssignmentState =
  | "SCHEDULED"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "MISSED"
  | "EXHAUSTED";

type QuestionWithOptions = Question & { options: QuestionOption[] };

function questionView(q: QuestionWithOptions) {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    order: q.order,
    points: q.points,
    options: [...q.options]
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, text: o.text })),
  };
}

function remainingSeconds(expiresAt: Date | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

async function loadQuestions(testId: string): Promise<QuestionWithOptions[]> {
  const questions = await prisma.question.findMany({
    where: { testId },
    include: { options: true },
    orderBy: { order: "asc" },
  });
  return questions;
}

/** Full attempt state for the student's test screen (never leaks correct answers). */
export async function buildAttemptView(attemptId: string, userId: string) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      test: {
        select: {
          id: true,
          title: true,
          description: true,
          topic: true,
          skill: true,
          difficulty: true,
          instructions: true,
          timeLimitSeconds: true,
          passingScore: true,
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.userId !== userId) throw ApiError.notFound("Attempt not found.");

  const questions = await loadQuestions(attempt.testId);
  const now = new Date();
  const expired = attempt.expiresAt ? now.getTime() > attempt.expiresAt.getTime() : false;

  return {
    id: attempt.id,
    testId: attempt.testId,
    assignmentId: attempt.assignmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    serverNow: now.toISOString(),
    remainingSeconds: expired ? 0 : remainingSeconds(attempt.expiresAt, now),
    expired: expired || attempt.status !== "IN_PROGRESS",
    test: attempt.test,
    questions: questions.map(questionView),
    answers: attempt.answers.map((a) => ({
      questionId: a.questionId,
      answerText: a.answerText,
      selectedOptionIds: a.selectedOptionIds,
    })),
  };
}

/** Starts (or resumes) an attempt for an assignment. */
export async function startAttempt(userId: string, assignmentId: string) {
  const assignment = await prisma.testAssignment.findUnique({
    where: { id: assignmentId },
    include: { test: { select: { id: true, title: true, timeLimitSeconds: true, status: true, deletedAt: true } } },
  });

  if (!assignment || assignment.test.deletedAt) throw ApiError.notFound("Assignment not found.");
  if (assignment.status !== "ACTIVE") throw ApiError.badRequest("This assignment is closed.");

  const membership = await prisma.groupMember.findFirst({
    where: { groupId: assignment.groupId, studentId: userId, student: { deletedAt: null } },
  });
  if (!membership) throw ApiError.forbidden("This test is not assigned to you.");

  const now = new Date();
  if (now < assignment.startAt) {
    throw ApiError.badRequest("This test has not started yet.");
  }
  if (now > assignment.deadlineAt) {
    throw ApiError.badRequest("The deadline for this test has passed.");
  }

  const existing = await prisma.testAttempt.findMany({
    where: { userId, assignmentId },
    orderBy: { startedAt: "desc" },
  });

  const inProgress = existing.find((a) => a.status === "IN_PROGRESS");
  if (inProgress) {
    if (inProgress.expiresAt && now.getTime() > inProgress.expiresAt.getTime() + GRACE_SECONDS * 1000) {
      // Time ran out while the tab was closed — grade it now.
      await finalizeAttempt(inProgress, { auto: true });
    } else {
      await logActivity(userId, "TEST_RESUMED", { attemptId: inProgress.id });
      return buildAttemptView(inProgress.id, userId);
    }
  }

  const finished = existing.filter(
    (a) => a.status !== "IN_PROGRESS" && a.startedAt.getTime() >= assignment.startAt.getTime(),
  ).length;
  if (finished >= assignment.maxAttempts) {
    throw ApiError.badRequest("You have no attempts remaining for this test.");
  }

  const duration = assignment.durationSeconds ?? assignment.test.timeLimitSeconds;
  const attempt = await prisma.testAttempt.create({
    data: {
      userId,
      testId: assignment.testId,
      assignmentId: assignment.id,
      startedAt: now,
      expiresAt: new Date(now.getTime() + duration * 1000),
      status: "IN_PROGRESS",
      totalPoints: 0,
    },
  });

  await logActivity(userId, "TEST_STARTED", { attemptId: attempt.id, testId: assignment.testId });

  return buildAttemptView(attempt.id, userId);
}

export async function getAttempt(userId: string, attemptId: string) {
  return buildAttemptView(attemptId, userId);
}

export type SaveAnswerInput = {
  questionId: string;
  answerText?: string | null;
  selectedOptionIds?: string[];
};

export async function saveAnswer(userId: string, attemptId: string, input: SaveAnswerInput) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw ApiError.notFound("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") {
    throw ApiError.badRequest("This test has already been submitted.");
  }

  const now = new Date();
  const expired = attempt.expiresAt && now.getTime() > attempt.expiresAt.getTime() + GRACE_SECONDS * 1000;
  if (expired) {
    const result = await finalizeAttempt(attempt, { auto: true });
    return { saved: false, expired: true, result };
  }

  const question = await prisma.question.findFirst({
    where: { id: input.questionId, testId: attempt.testId },
    select: { id: true },
  });
  if (!question) throw ApiError.badRequest("Question not found for this test.");

  const selected = input.selectedOptionIds ?? [];
  const text = input.answerText?.trim() || null;

  if (!selected.length && !text) {
    await prisma.answer.deleteMany({ where: { attemptId, questionId: input.questionId } });
  } else {
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: input.questionId } },
      create: {
        attemptId,
        questionId: input.questionId,
        answerText: text,
        selectedOptionIds: selected,
        answeredAt: now,
      },
      update: { answerText: text, selectedOptionIds: selected, answeredAt: now },
    });
  }

  return { saved: true, savedAt: now.toISOString() };
}

export async function recordEvent(
  userId: string,
  attemptId: string,
  type: "TAB_BLUR" | "PAGE_REFRESH" | "VISIBILITY",
) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw ApiError.notFound("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") return { recorded: false };

  const isRefresh = type === "PAGE_REFRESH";
  await prisma.testAttempt.update({
    where: { id: attemptId },
    data: isRefresh ? { refreshCount: { increment: 1 } } : { tabSwitches: { increment: 1 } },
  });
  await logActivity(userId, isRefresh ? "PAGE_REFRESH" : "TAB_BLUR", { attemptId });
  return { recorded: true };
}

type SubmitResult = Awaited<ReturnType<typeof buildResultView>>;

async function finalizeAttempt(
  attempt: TestAttempt,
  opts: { auto: boolean; actorId?: string },
): Promise<SubmitResult> {
  const questions = await loadQuestions(attempt.testId);
  const answers = await prisma.answer.findMany({ where: { attemptId: attempt.id } });
  const graded = gradeAttempt(questions, answers);

  const now = new Date();
  const limit = attempt.expiresAt ?? now;
  const isLate = now.getTime() > limit.getTime() + GRACE_SECONDS * 1000;
  const submittedAt = opts.auto || isLate ? new Date(Math.min(now.getTime(), limit.getTime())) : now;
  const durationSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
  );

  const [updated] = await prisma.$transaction([
    prisma.testAttempt.update({
      where: { id: attempt.id },
      data: {
        submittedAt,
        durationSeconds,
        score: graded.score,
        totalPoints: graded.totalPoints,
        percentage: graded.percentage,
        status: opts.auto || isLate ? "TIME_UP" : "SUBMITTED",
      },
    }),
    ...graded.details.map((detail) =>
      prisma.answer.updateMany({
        where: { attemptId: attempt.id, questionId: detail.questionId },
        data: { isCorrect: detail.isCorrect },
      }),
    ),
  ]);

  await Promise.all([
    updateSkillProgress(attempt.userId, attempt.testId, graded.percentage, durationSeconds, questions.length, graded),
    recordMeaningfulActivity(attempt.userId),
    logActivity(attempt.userId, opts.auto ? "AUTO_SUBMITTED" : "TEST_SUBMITTED", {
      attemptId: attempt.id,
      percentage: graded.percentage,
    }),
    notifyTeachersForCompletion(attempt, graded.percentage),
  ]);

  return buildResultView(updated.id, opts.actorId ?? attempt.userId, true);
}

async function notifyTeachersForCompletion(attempt: TestAttempt, percentage: number) {
  if (!attempt.assignmentId) return;
  const assignment = await prisma.testAssignment.findUnique({
    where: { id: attempt.assignmentId },
    include: { test: { select: { title: true } }, group: { select: { name: true } } },
  });
  if (!assignment) return;
  const student = await prisma.user.findUnique({
    where: { id: attempt.userId },
    select: { firstName: true, lastName: true },
  });
  if (assignment.assignedById) {
    await notify([assignment.assignedById], {
      type: "STUDENT_COMPLETED",
      title: `${student?.firstName ?? "Student"} completed "${assignment.test.title}"`,
      body: `Score ${percentage}% in ${assignment.group.name}.`,
      link: `/teacher/tests/${assignment.testId}/results`,
    });
  }
}

async function updateSkillProgress(
  userId: string,
  testId: string,
  percentage: number,
  durationSeconds: number,
  questionCount: number,
  graded: ReturnType<typeof gradeAttempt>,
) {
  try {
    const test = await prisma.test.findUnique({ where: { id: testId }, select: { skill: true } });
    const skill = test?.skill ?? "GRAMMAR";

    const existing = await prisma.studentProgress.findUnique({
      where: { userId_skill: { userId, skill } },
    });

    const completed = (existing?.completedCount ?? 0) + 1;
    const newAverage =
      Math.round(
        (((existing?.averagePercentage ?? 0) * (existing?.completedCount ?? 0)) + percentage) /
          completed *
          10,
      ) / 10;

    await prisma.studentProgress.upsert({
      where: { userId_skill: { userId, skill } },
      create: {
        userId,
        skill,
        completedCount: completed,
        correctAnswers: graded.correctCount,
        totalAnswers: questionCount,
        totalSeconds: durationSeconds,
        averagePercentage: newAverage,
        lastActivityAt: new Date(),
      },
      update: {
        completedCount: completed,
        correctAnswers: { increment: graded.correctCount },
        totalAnswers: { increment: questionCount },
        totalSeconds: { increment: durationSeconds },
        averagePercentage: newAverage,
        lastActivityAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[progress] update failed:", (err as Error).message);
  }
}

export async function submitAttempt(userId: string, attemptId: string, auto = false) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw ApiError.notFound("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") {
    return buildResultView(attemptId, userId, true);
  }
  return finalizeAttempt(attempt, { auto, actorId: userId });
}

/** Detailed, review-safe result (includes correct answers after submission). */
export async function buildResultView(attemptId: string, viewerId: string, submitted: boolean) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      test: { select: { id: true, title: true, topic: true, skill: true, difficulty: true, passingScore: true } },
      answers: true,
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
      assignment: { select: { group: { select: { id: true, name: true } } } },
    },
  });

  if (!attempt) throw ApiError.notFound("Attempt not found.");

  const isOwner = attempt.userId === viewerId;
  if (!isOwner) {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } });
    if (viewer?.role !== "TEACHER") throw ApiError.forbidden();
  }

  const questions = await loadQuestions(attempt.testId);
  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const detail = gradeAttempt(questions, attempt.answers);
  const passScore = await passingScore(attempt.testId);
  const finalPercentage = submitted ? attempt.percentage : detail.percentage;
  const review = questions.map((q) => {
    const answer = answerMap.get(q.id);
    return {
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      topic: q.topic,
      options: [...q.options]
        .sort((a, b) => a.order - b.order)
        .map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
      correctAnswer: q.correctAnswer,
      yourAnswer: {
        answerText: answer?.answerText ?? null,
        selectedOptionIds: answer?.selectedOptionIds ?? [],
      },
      isCorrect: detail.details.find((d) => d.questionId === q.id)?.isCorrect ?? null,
      answered: Boolean(answer),
    };
  });

  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    expiresAt: attempt.expiresAt,
    durationSeconds: attempt.durationSeconds,
    score: submitted ? attempt.score : detail.score,
    totalPoints: submitted && attempt.totalPoints ? attempt.totalPoints : detail.totalPoints,
    percentage: submitted ? attempt.percentage : detail.percentage,
    correctCount: detail.correctCount,
    wrongCount: detail.wrongCount,
    unansweredCount: detail.unansweredCount,
    pendingCount: detail.pendingCount,
    tabSwitches: attempt.tabSwitches,
    refreshCount: attempt.refreshCount,
    passed: finalPercentage >= passScore,
    test: attempt.test,
    student: attempt.user,
    group: attempt.assignment?.group ?? null,
    questions: submitted ? review : undefined,
  };
}

async function passingScore(testId: string) {
  const test = await prisma.test.findUnique({ where: { id: testId }, select: { passingScore: true } });
  return test?.passingScore ?? 60;
}

// ── Student: assigned tests & history ────────────────────────────────

export async function listAssigned(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { studentId: userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (!groupIds.length) return [];

  const assignments = await prisma.testAssignment.findMany({
    where: { groupId: { in: groupIds }, status: "ACTIVE", test: { deletedAt: null } },
    include: {
      test: {
        select: {
          id: true,
          title: true,
          description: true,
          topic: true,
          skill: true,
          difficulty: true,
          instructions: true,
          timeLimitSeconds: true,
          passingScore: true,
          _count: { select: { questions: true } },
        },
      },
      group: { select: { id: true, name: true } },
      attempts: {
        where: { userId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          percentage: true,
          score: true,
          totalPoints: true,
          startedAt: true,
          expiresAt: true,
          submittedAt: true,
          durationSeconds: true,
        },
      },
    },
    orderBy: { deadlineAt: "asc" },
  });

  const now = new Date();

  return assignments.map((a) => {
    // Only attempts inside the current assignment window count — a re-assigned
    // test gives students a fresh attempt.
    const inWindow = a.attempts.filter((at) => at.startedAt.getTime() >= a.startAt.getTime());
    const finished = inWindow.filter((at) => at.status !== "IN_PROGRESS");
    const running = inWindow.find((at) => at.status === "IN_PROGRESS") ??
      a.attempts.find((at) => at.status === "IN_PROGRESS");
    const best = finished.length
      ? finished.reduce((top, cur) => (cur.percentage > top.percentage ? cur : top))
      : null;

    let state: AssignmentState = "AVAILABLE";
    if (running) state = "IN_PROGRESS";
    else if (finished.length >= a.maxAttempts) state = "COMPLETED";
    else if (now < a.startAt) state = "SCHEDULED";
    else if (now > a.deadlineAt) state = "MISSED";
    else if (finished.length > 0) state = "AVAILABLE";

    return {
      assignmentId: a.id,
      state,
      startAt: a.startAt,
      deadlineAt: a.deadlineAt,
      durationSeconds: a.durationSeconds ?? a.test.timeLimitSeconds,
      maxAttempts: a.maxAttempts,
      attemptsUsed: finished.length,
      group: a.group,
      test: {
        ...a.test,
        questionCount: a.test._count.questions,
      },
      activeAttempt: running
        ? { id: running.id, startedAt: running.startedAt, expiresAt: running.expiresAt }
        : null,
      bestResult: best
        ? {
            id: best.id,
            percentage: best.percentage,
            score: best.score,
            totalPoints: best.totalPoints,
            submittedAt: best.submittedAt,
            durationSeconds: best.durationSeconds,
          }
        : null,
    };
  });
}

export async function listMyAttempts(
  userId: string,
  params: { page: number; limit: number; status?: "SUBMITTED" | "TIME_UP" | "IN_PROGRESS" },
) {
  const where: Prisma.TestAttemptWhereInput = {
    userId,
    ...(params.status ? { status: params.status } : { status: { in: ["SUBMITTED", "TIME_UP"] } }),
  };

  const [total, items] = await Promise.all([
    prisma.testAttempt.count({ where }),
    prisma.testAttempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: {
        id: true,
        status: true,
        score: true,
        totalPoints: true,
        percentage: true,
        startedAt: true,
        submittedAt: true,
        durationSeconds: true,
        test: { select: { id: true, title: true, topic: true, skill: true, difficulty: true } },
        assignment: { select: { group: { select: { name: true } } } },
      },
    }),
  ]);

  return { items, total };
}

export async function getStudentResult(userId: string, attemptId: string) {
  return buildResultView(attemptId, userId, true);
}

export type { ActivityType };
