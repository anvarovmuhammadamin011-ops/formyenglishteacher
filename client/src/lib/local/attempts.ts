import { getProgress, getStreak, logActivity, mutate, nowIso, pushNotification, uid } from "@/lib/db";
import { gradeAttempt, type GradingQuestion } from "@/lib/grading";
import type { Db, DbAnswer, DbAttempt, DbQuestion, DbOption } from "@/lib/types";
import { badRequest, forbidden, notFound, type Handler } from "./core";

const GRACE_SECONDS = 15;

type QuestionWithOptions = DbQuestion & { options: DbOption[] };

function loadQuestions(db: Db, testId: string): QuestionWithOptions[] {
  return db.questions
    .filter((q) => q.testId === testId)
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      ...q,
      options: db.questionOptions.filter((o) => o.questionId === q.id).sort((a, b) => a.order - b.order),
    }));
}

function questionView(q: QuestionWithOptions) {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    order: q.order,
    points: q.points,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  };
}

function remainingSeconds(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function recordMeaningfulActivity(db: Db, userId: string, when = new Date()): number {
  const streak = getStreak(db, userId);
  const dayStart = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  const yesterday = new Date(dayStart.getTime() - 86_400_000);

  if (streak.lastActivityOn && sameDay(new Date(streak.lastActivityOn), dayStart)) {
    return streak.currentStreak;
  }
  const continues = streak.lastActivityOn && sameDay(new Date(streak.lastActivityOn), yesterday);
  streak.currentStreak = continues ? streak.currentStreak + 1 : 1;
  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
  streak.lastActivityOn = dayStart.toISOString();
  streak.updatedAt = nowIso();
  return streak.currentStreak;
}

function buildAttemptView(db: Db, attemptId: string, userId: string) {
  const attempt = db.attempts.find((a) => a.id === attemptId);
  if (!attempt || attempt.userId !== userId) notFound("Attempt not found.");

  const test = db.tests.find((t) => t.id === attempt!.testId);
  if (!test) notFound("Attempt not found.");

  const questions = loadQuestions(db, attempt!.testId);
  const answers = db.answers.filter((a) => a.attemptId === attempt!.id);
  const now = new Date();
  const expiresAt = attempt!.expiresAt ? new Date(attempt!.expiresAt) : null;
  const expired = expiresAt ? now.getTime() > expiresAt.getTime() : false;

  return {
    id: attempt!.id,
    testId: attempt!.testId,
    assignmentId: attempt!.assignmentId,
    status: attempt!.status,
    startedAt: attempt!.startedAt,
    expiresAt: attempt!.expiresAt,
    submittedAt: attempt!.submittedAt,
    serverNow: now.toISOString(),
    remainingSeconds: expired ? 0 : remainingSeconds(attempt!.expiresAt, now),
    expired: expired || attempt!.status !== "IN_PROGRESS",
    test: {
      id: test.id,
      title: test.title,
      description: test.description,
      topic: test.topic,
      skill: test.skill,
      difficulty: test.difficulty,
      instructions: test.instructions,
      timeLimitSeconds: test.timeLimitSeconds,
      passingScore: test.passingScore,
    },
    questions: questions.map(questionView),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answerText: a.answerText,
      selectedOptionIds: a.selectedOptionIds,
    })),
  };
}

function buildResultView(db: Db, attemptId: string, viewerId: string, submitted: boolean) {
  const attempt = db.attempts.find((a) => a.id === attemptId);
  if (!attempt) notFound("Attempt not found.");

  const viewer = db.users.find((u) => u.id === viewerId);
  const isOwner = attempt!.userId === viewerId;
  if (!isOwner && viewer?.role !== "TEACHER") forbidden();

  const test = db.tests.find((t) => t.id === attempt!.testId);
  const student = db.users.find((u) => u.id === attempt!.userId);
  const assignment = attempt!.assignmentId ? db.assignments.find((a) => a.id === attempt!.assignmentId) : null;
  const group = assignment ? db.groups.find((g) => g.id === assignment.groupId) : null;
  const questions = loadQuestions(db, attempt!.testId);
  const answers = db.answers.filter((a) => a.attemptId === attempt!.id);
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  const grading = gradeAttempt(questions as unknown as GradingQuestion[], answers);
  const passScore = test?.passingScore ?? 60;
  const finalPercentage = submitted ? attempt!.percentage : grading.percentage;

  const review = questions.map((q) => {
    const answer = answerMap.get(q.id);
    return {
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      topic: q.topic,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
      correctAnswer: q.correctAnswer,
      yourAnswer: {
        answerText: answer?.answerText ?? null,
        selectedOptionIds: answer?.selectedOptionIds ?? [],
      },
      isCorrect: grading.details.find((d) => d.questionId === q.id)?.isCorrect ?? null,
      answered: Boolean(answer),
    };
  });

  return {
    id: attempt!.id,
    status: attempt!.status,
    startedAt: attempt!.startedAt,
    submittedAt: attempt!.submittedAt,
    expiresAt: attempt!.expiresAt,
    durationSeconds: attempt!.durationSeconds,
    score: submitted ? attempt!.score : grading.score,
    totalPoints: submitted && attempt!.totalPoints ? attempt!.totalPoints : grading.totalPoints,
    percentage: submitted ? attempt!.percentage : grading.percentage,
    correctCount: grading.correctCount,
    wrongCount: grading.wrongCount,
    unansweredCount: grading.unansweredCount,
    pendingCount: grading.pendingCount,
    tabSwitches: attempt!.tabSwitches,
    refreshCount: attempt!.refreshCount,
    passed: finalPercentage >= passScore,
    test: test
      ? {
          id: test.id,
          title: test.title,
          topic: test.topic,
          skill: test.skill,
          difficulty: test.difficulty,
          passingScore: test.passingScore,
        }
      : { id: attempt!.testId, title: "—", topic: null, skill: "GRAMMAR" as const, difficulty: "BEGINNER" as const, passingScore: passScore },
    student: student
      ? { id: student.id, firstName: student.firstName, lastName: student.lastName, username: student.username }
      : { id: attempt!.userId, firstName: "?", lastName: "", username: "?" },
    group: group ? { name: group.name } : null,
    questions: submitted ? review : undefined,
  };
}

function finalizeAttempt(
  db: Db,
  attempt: DbAttempt,
  opts: { auto: boolean; actorId?: string },
) {
  const questions = loadQuestions(db, attempt.testId);
  const answers = db.answers.filter((a) => a.attemptId === attempt.id);
  const grading = gradeAttempt(questions as unknown as GradingQuestion[], answers);

  const now = new Date();
  const limit = attempt.expiresAt ? new Date(attempt.expiresAt) : now;
  const isLate = now.getTime() > limit.getTime() + GRACE_SECONDS * 1000;
  const submittedAt = (opts.auto || isLate
    ? new Date(Math.min(now.getTime(), limit.getTime()))
    : now
  ).toISOString();
  const durationSeconds = Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000));

  attempt.submittedAt = submittedAt;
  attempt.durationSeconds = durationSeconds;
  attempt.score = grading.score;
  attempt.totalPoints = grading.totalPoints;
  attempt.percentage = grading.percentage;
  attempt.status = opts.auto || isLate ? "TIME_UP" : "SUBMITTED";
  attempt.updatedAt = nowIso();

  grading.details.forEach((detail) => {
    const row = db.answers.find((a) => a.attemptId === attempt.id && a.questionId === detail.questionId);
    if (row) row.isCorrect = detail.isCorrect;
  });

  updateSkillProgress(db, attempt.userId, attempt.testId, grading.percentage, durationSeconds, questions.length, grading);
  recordMeaningfulActivity(db, attempt.userId);
  logActivity(db, attempt.userId, opts.auto ? "AUTO_SUBMITTED" : "TEST_SUBMITTED", {
    attemptId: attempt.id,
    percentage: grading.percentage,
  });
  notifyTeachersForCompletion(db, attempt, grading.percentage);

  return buildResultView(db, attempt.id, opts.actorId ?? attempt.userId, true);
}

function updateSkillProgress(
  db: Db,
  userId: string,
  testId: string,
  percentage: number,
  durationSeconds: number,
  questionCount: number,
  grading: ReturnType<typeof gradeAttempt>,
): void {
  try {
    const test = db.tests.find((t) => t.id === testId);
    const skill = test?.skill ?? "GRAMMAR";
    const row = getProgress(db, userId, skill);

    const completed = row.completedCount + 1;
    row.completedCount = completed;
    row.correctAnswers += grading.correctCount;
    row.totalAnswers += questionCount;
    row.totalSeconds += durationSeconds;
    row.averagePercentage = Math.round(((row.averagePercentage * (completed - 1) + percentage) / completed) * 10) / 10;
    row.lastActivityAt = nowIso();
    row.updatedAt = nowIso();
  } catch {
    /* progress must never break submission */
  }
}

function notifyTeachersForCompletion(db: Db, attempt: DbAttempt, percentage: number): void {
  if (!attempt.assignmentId) return;
  const assignment = db.assignments.find((a) => a.id === attempt.assignmentId);
  if (!assignment) return;
  const test = db.tests.find((t) => t.id === assignment.testId);
  const group = db.groups.find((g) => g.id === assignment.groupId);
  const student = db.users.find((u) => u.id === attempt.userId);
  if (assignment.assignedById) {
    pushNotification(
      db,
      assignment.assignedById,
      "STUDENT_COMPLETED",
      `${student?.firstName ?? "Student"} completed "${test?.title ?? "test"}"`,
      `Score ${percentage}% in ${group?.name ?? "group"}.`,
      `/tests/${assignment.testId}/results`,
    );
  }
}

export const attemptRoutes: Record<string, Handler> = {
  "GET /attempts/assigned": (ctx) => {
    const user = ctx.requireStudent();
    const memberships = ctx.db.groupMembers.filter((m) => m.studentId === user.id);
    const groupIds = memberships.map((m) => m.groupId);
    if (!groupIds.length) return [];

    const assignments = ctx.db.assignments
      .filter((a) => groupIds.includes(a.groupId) && a.status === "ACTIVE")
      .filter((a) => {
        const t = ctx.db.tests.find((x) => x.id === a.testId);
        return t && !t.deletedAt;
      })
      .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));

    const now = new Date();

    return assignments.map((a) => {
      const test = ctx.db.tests.find((t) => t.id === a.testId)!;
      const group = ctx.db.groups.find((g) => g.id === a.groupId)!;
      const attempts = ctx.db.attempts
        .filter((at) => at.userId === user.id && at.assignmentId === a.id)
        .sort((x, y) => y.startedAt.localeCompare(x.startedAt));

      const inWindow = attempts.filter((at) => new Date(at.startedAt).getTime() >= new Date(a.startAt).getTime());
      const finished = inWindow.filter((at) => at.status !== "IN_PROGRESS");
      const running =
        inWindow.find((at) => at.status === "IN_PROGRESS") ?? attempts.find((at) => at.status === "IN_PROGRESS");
      const best = finished.length
        ? finished.reduce((top, cur) => (cur.percentage > top.percentage ? cur : top))
        : null;

      let state = "AVAILABLE";
      if (running) state = "IN_PROGRESS";
      else if (finished.length >= a.maxAttempts) state = "COMPLETED";
      else if (now < new Date(a.startAt)) state = "SCHEDULED";
      else if (now > new Date(a.deadlineAt)) state = "MISSED";
      else if (finished.length > 0) state = "AVAILABLE";

      return {
        assignmentId: a.id,
        state,
        startAt: a.startAt,
        deadlineAt: a.deadlineAt,
        durationSeconds: a.durationSeconds ?? test.timeLimitSeconds,
        maxAttempts: a.maxAttempts,
        attemptsUsed: finished.length,
        group: { name: group.name },
        test: {
          id: test.id,
          title: test.title,
          description: test.description,
          topic: test.topic,
          skill: test.skill,
          difficulty: test.difficulty,
          instructions: test.instructions,
          timeLimitSeconds: test.timeLimitSeconds,
          passingScore: test.passingScore,
          questionCount: ctx.db.questions.filter((q) => q.testId === test.id).length,
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
  },

  "POST /attempts/start": (ctx) => {
    const user = ctx.requireStudent();
    const assignmentId = String(ctx.body?.assignmentId ?? "");
    if (!assignmentId) badRequest("Assignment is required.");

    let view: unknown = null;
    mutate((db) => {
      const assignment = db.assignments.find((a) => a.id === assignmentId);
      const test = assignment ? db.tests.find((t) => t.id === assignment.testId) : undefined;
      if (!assignment || !test || test.deletedAt) notFound("Assignment not found.");
      if (assignment!.status !== "ACTIVE") badRequest("This assignment is closed.");

      const membership = db.groupMembers.find(
        (m) => m.groupId === assignment!.groupId && m.studentId === user.id && !db.users.find((u) => u.id === m.studentId)?.deletedAt,
      );
      if (!membership) forbidden("This test is not assigned to you.");

      const now = new Date();
      if (now < new Date(assignment!.startAt)) badRequest("This test has not started yet.");
      if (now > new Date(assignment!.deadlineAt)) badRequest("The deadline for this test has passed.");

      const existing = db.attempts
        .filter((a) => a.userId === user.id && a.assignmentId === assignment!.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      const inProgress = existing.find((a) => a.status === "IN_PROGRESS");
      if (inProgress) {
        const expired =
          inProgress.expiresAt &&
          now.getTime() > new Date(inProgress.expiresAt).getTime() + GRACE_SECONDS * 1000;
        if (expired) {
          finalizeAttempt(db, inProgress, { auto: true });
        } else {
          logActivity(db, user.id, "TEST_RESUMED", { attemptId: inProgress.id });
          view = buildAttemptView(db, inProgress.id, user.id);
          return;
        }
      }

      const finished = existing.filter(
        (a) => a.status !== "IN_PROGRESS" && new Date(a.startedAt).getTime() >= new Date(assignment!.startAt).getTime(),
      ).length;
      if (finished >= assignment!.maxAttempts) {
        badRequest("You have no attempts remaining for this test.");
      }

      const duration = assignment!.durationSeconds ?? test!.timeLimitSeconds;
      const attempt: DbAttempt = {
        id: uid("att"),
        userId: user.id,
        testId: assignment!.testId,
        assignmentId: assignment!.id,
        startedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + duration * 1000).toISOString(),
        submittedAt: null,
        durationSeconds: null,
        score: 0,
        totalPoints: 0,
        percentage: 0,
        status: "IN_PROGRESS",
        tabSwitches: 0,
        refreshCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      db.attempts.push(attempt);
      logActivity(db, user.id, "TEST_STARTED", { attemptId: attempt.id, testId: attempt.testId });
      view = buildAttemptView(db, attempt.id, user.id);
    });
    return view;
  },

  "GET /attempts/:id": (ctx) => {
    const user = ctx.requireUser();
    return buildAttemptView(ctx.db, ctx.params.id, user.id);
  },

  "POST /attempts/:id/answer": (ctx) => {
    const user = ctx.requireStudent();
    const body = ctx.body ?? {};
    const questionId = String(body.questionId ?? "");
    if (!questionId) badRequest("Question is required.");
    const selected: string[] = Array.isArray(body.selectedOptionIds)
      ? body.selectedOptionIds.filter((x: unknown) => typeof x === "string").slice(0, 10)
      : [];
    const text = typeof body.answerText === "string" && body.answerText.trim() ? body.answerText.trim().slice(0, 4000) : null;

    let result: { saved: boolean; expired?: boolean; result?: unknown; savedAt?: string } = { saved: false };
    mutate((db) => {
      const attempt = db.attempts.find((a) => a.id === ctx.params.id);
      if (!attempt || attempt.userId !== user.id) notFound("Attempt not found.");
      if (attempt!.status !== "IN_PROGRESS") badRequest("This test has already been submitted.");

      const now = new Date();
      const expired =
        attempt!.expiresAt &&
        now.getTime() > new Date(attempt!.expiresAt).getTime() + GRACE_SECONDS * 1000;
      if (expired) {
        const res = finalizeAttempt(db, attempt!, { auto: true });
        result = { saved: false, expired: true, result: res };
        return;
      }

      const question = db.questions.find((q) => q.id === questionId && q.testId === attempt!.testId);
      if (!question) badRequest("Question not found for this test.");

      if (!selected.length && !text) {
        db.answers = db.answers.filter((a) => !(a.attemptId === attempt!.id && a.questionId === questionId));
      } else {
        const existing = db.answers.find((a) => a.attemptId === attempt!.id && a.questionId === questionId);
        if (existing) {
          existing.answerText = text;
          existing.selectedOptionIds = selected;
          existing.answeredAt = now.toISOString();
        } else {
          const row: DbAnswer = {
            id: uid("ans"),
            attemptId: attempt!.id,
            questionId,
            answerText: text,
            selectedOptionIds: selected,
            isCorrect: null,
            answeredAt: now.toISOString(),
          };
          db.answers.push(row);
        }
      }
      result = { saved: true, savedAt: now.toISOString() };
    });
    return result;
  },

  "POST /attempts/:id/event": (ctx) => {
    const user = ctx.requireStudent();
    const type = String(ctx.body?.type ?? "");
    if (!["TAB_BLUR", "PAGE_REFRESH", "VISIBILITY"].includes(type)) badRequest("Invalid event type.");
    let recorded = false;
    mutate((db) => {
      const attempt = db.attempts.find((a) => a.id === ctx.params.id);
      if (!attempt || attempt.userId !== user.id) notFound("Attempt not found.");
      if (attempt!.status !== "IN_PROGRESS") return;
      if (type === "PAGE_REFRESH") attempt!.refreshCount += 1;
      else attempt!.tabSwitches += 1;
      attempt!.updatedAt = nowIso();
      logActivity(db, user.id, type === "PAGE_REFRESH" ? "PAGE_REFRESH" : "TAB_BLUR", { attemptId: attempt!.id });
      recorded = true;
    });
    return { recorded };
  },

  "POST /attempts/:id/submit": (ctx) => {
    const user = ctx.requireStudent();
    const auto = Boolean(ctx.body?.auto);
    let result: unknown = null;
    mutate((db) => {
      const attempt = db.attempts.find((a) => a.id === ctx.params.id);
      if (!attempt || attempt.userId !== user.id) notFound("Attempt not found.");
      if (attempt!.status !== "IN_PROGRESS") {
        result = buildResultView(db, attempt!.id, user.id, true);
        return;
      }
      result = finalizeAttempt(db, attempt!, { auto, actorId: user.id });
    });
    return result;
  },

  "GET /attempts/:id/result": (ctx) => {
    const user = ctx.requireUser();
    return buildResultView(ctx.db, ctx.params.id, user.id, true);
  },
};
