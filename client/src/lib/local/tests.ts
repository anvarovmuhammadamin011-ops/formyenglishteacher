import { mutate, uid, nowIso, pushNotification } from "@/lib/db";
import type { Db, DbAssignment, DbQuestion, DbTest, Skill, Level, QuestionType, TestStatusValue } from "@/lib/types";
import { badRequest, notFound, okList, page, HttpError, type Handler, qStr, qBool } from "./core";

export type QuestionInput = {
  type: QuestionType;
  text: string;
  topic?: string;
  explanation?: string;
  correctAnswer?: string;
  points?: number;
  options: Array<{ text: string; isCorrect: boolean }>;
};

type Issue = { path: string; message: string };

function validationError(issues: Issue[]): never {
  throw new HttpError(422, "Please check the highlighted fields.", "VALIDATION_ERROR", issues);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function optStr(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : undefined;
}
function clampInt(v: unknown, min: number, max: number, fallback?: number): number | undefined {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const LEVELS: Level[] = ["BEGINNER", "ELEMENTARY", "PRE_INTERMEDIATE", "INTERMEDIATE", "UPPER_INTERMEDIATE", "ADVANCED"];
const SKILLS: Skill[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"];
const QTYPES: QuestionType[] = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MULTIPLE_SELECT", "FILL_BLANK", "MATCHING", "SHORT_ANSWER"];
const TSTATUSES: TestStatusValue[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function normalizeAndValidate(raw: unknown): { questions: QuestionInput[]; issues: Issue[] } {
  const list = Array.isArray(raw) ? (raw as any[]) : [];
  const issues: Issue[] = [];
  const questions: QuestionInput[] = list.map((q, i) => {
    const p = `questions.${i}`;
    const type = QTYPES.includes(q?.type) ? q.type : ("MULTIPLE_CHOICE" as QuestionType);
    const text = str(q?.text).trim();
    if (!text) issues.push({ path: `${p}.text`, message: "Question text is required" });
    if (text.length > 2000) issues.push({ path: `${p}.text`, message: "Question is too long" });

    const optionsRaw: any[] = Array.isArray(q?.options) ? q.options.slice(0, 8) : [];
    const options = optionsRaw.map((o) => ({ text: str(o?.text).trim(), isCorrect: Boolean(o?.isCorrect) }));
    const correctCount = options.filter((o) => o.isCorrect).length;
    let correctAnswer = optStr(q?.correctAnswer);

    if (type === "MULTIPLE_CHOICE") {
      if (options.length < 2) issues.push({ path: `${p}.options`, message: "Add at least 2 options." });
      if (correctCount !== 1) issues.push({ path: `${p}.options`, message: "Mark exactly one correct answer." });
      options.forEach((o) => {
        if (!o.text) issues.push({ path: `${p}.options`, message: "Option cannot be empty" });
      });
    } else if (type === "MULTIPLE_SELECT") {
      if (options.length < 2) issues.push({ path: `${p}.options`, message: "Add at least 2 options." });
      if (correctCount < 1) issues.push({ path: `${p}.options`, message: "Mark at least one correct answer." });
    } else if (type === "TRUE_FALSE") {
      const derived = correctAnswer ?? options.find((o) => o.isCorrect)?.text ?? "";
      if (!/^(true|false|to'g'ri|noto'g'ri|ha|yo'q)/i.test(derived.trim())) {
        issues.push({ path: `${p}.correctAnswer`, message: "Set the correct answer to True or False." });
      }
      const correct = /^(t|true|ha|to'g'ri)/i.test(derived.trim());
      correctAnswer = correct ? "true" : "false";
      options.length = 0;
      options.push({ text: "True", isCorrect: correct }, { text: "False", isCorrect: !correct });
    } else if (type === "FILL_BLANK") {
      if (!correctAnswer) issues.push({ path: `${p}.correctAnswer`, message: "Provide the correct answer." });
    } else if (type === "MATCHING") {
      if (!correctAnswer) {
        issues.push({ path: `${p}.correctAnswer`, message: 'Provide pairs, e.g. [{"left":"go","right":"bormoq"}].' });
      }
    }

    return {
      type,
      text,
      topic: optStr(q?.topic)?.slice(0, 80),
      explanation: optStr(q?.explanation)?.slice(0, 1500),
      correctAnswer,
      points: clampInt(q?.points, 1, 100, 1) as number,
      options,
    };
  });

  return { questions, issues };
}

function questionsOf(db: Db, testId: string) {
  return db.questions
    .filter((q) => q.testId === testId)
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      ...q,
      options: db.questionOptions
        .filter((o) => o.questionId === q.id)
        .sort((a, b) => a.order - b.order),
    }));
}

function testDetail(db: Db, id: string) {
  const test = db.tests.find((t) => t.id === id && !t.deletedAt);
  if (!test) notFound("Test not found.");
  const author = db.users.find((u) => u.id === test!.createdById);
  const attempts = db.attempts.filter((a) => a.testId === id);
  return {
    id: test!.id,
    title: test!.title,
    description: test!.description,
    topic: test!.topic,
    skill: test!.skill,
    difficulty: test!.difficulty,
    timeLimitSeconds: test!.timeLimitSeconds,
    passingScore: test!.passingScore,
    instructions: test!.instructions,
    type: test!.type,
    status: test!.status,
    aiPrompt: test!.aiPrompt,
    createdAt: test!.createdAt,
    updatedAt: test!.updatedAt,
    createdBy: author
      ? { id: author.id, firstName: author.firstName, lastName: author.lastName }
      : null,
    questions: questionsOf(db, id).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      topic: q.topic,
      explanation: q.explanation,
      correctAnswer: q.correctAnswer,
      order: q.order,
      points: q.points,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, order: o.order })),
    })),
    assignments: db.assignments
      .filter((a) => a.testId === id)
      .map((a) => ({
        id: a.id,
        startAt: a.startAt,
        deadlineAt: a.deadlineAt,
        durationSeconds: a.durationSeconds,
        maxAttempts: a.maxAttempts,
        status: a.status,
        group: (() => {
          const g = db.groups.find((x) => x.id === a.groupId);
          return g ? { id: g.id, name: g.name, level: g.level } : null;
        })(),
        _count: {
          attempts: attempts.filter((at) => at.assignmentId === a.id && (at.status === "SUBMITTED" || at.status === "TIME_UP")).length,
        },
      })),
    _count: {
      questions: db.questions.filter((q) => q.testId === id).length,
      attempts: attempts.filter((a) => a.status === "SUBMITTED" || a.status === "TIME_UP").length,
    },
  };
}

function persistQuestions(db: Db, testId: string, questions: QuestionInput[]): void {
  const ids = db.questions.filter((q) => q.testId === testId).map((q) => q.id);
  db.questionOptions = db.questionOptions.filter((o) => !ids.includes(o.questionId));
  db.questions = db.questions.filter((q) => q.testId !== testId);
  const now = nowIso();
  questions.forEach((q, idx) => {
    const question: DbQuestion = {
      id: uid("qst"),
      testId,
      type: q.type,
      text: q.text,
      topic: q.topic ?? null,
      explanation: q.explanation ?? null,
      correctAnswer: q.correctAnswer ?? null,
      order: idx,
      points: q.points ?? 1,
      createdAt: now,
      updatedAt: now,
    };
    db.questions.push(question);
    q.options.forEach((o, oi) => {
      db.questionOptions.push({
        id: uid("opt"),
        questionId: question.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: oi,
      });
    });
  });
}

export const testsRoutes: Record<string, Handler> = {
  "GET /tests": (ctx) => {
    ctx.requireTeacher();
    const pg = page(ctx, 20, 100);
    const search = qStr(ctx, "search").toLowerCase();
    const status = qStr(ctx, "status");
    const skill = qStr(ctx, "skill");
    const type = qStr(ctx, "type");
    const groupId = qStr(ctx, "groupId");

    const list = ctx.db.tests.filter((t) => {
      if (t.deletedAt) return false;
      if (status && t.status !== status) return false;
      if (skill && t.skill !== skill) return false;
      if (type && t.type !== type) return false;
      if (groupId && !ctx.db.assignments.some((a) => a.testId === t.id && a.groupId === groupId)) return false;
      if (search) {
        const hay = `${t.title} ${t.topic ?? ""} ${t.description ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const total = list.length;
    const items = [...list]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(pg.skip, pg.skip + pg.take)
      .map((t) => {
        const attempts = ctx.db.attempts.filter((a) => a.testId === t.id);
        return {
          id: t.id,
          title: t.title,
          topic: t.topic,
          skill: t.skill,
          difficulty: t.difficulty,
          type: t.type,
          status: t.status,
          timeLimitSeconds: t.timeLimitSeconds,
          passingScore: t.passingScore,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          _count: {
            questions: ctx.db.questions.filter((q) => q.testId === t.id).length,
            attempts: attempts.filter((a) => a.status === "SUBMITTED" || a.status === "TIME_UP").length,
          },
          assignments: ctx.db.assignments
            .filter((a) => a.testId === t.id)
            .map((a) => {
              const g = ctx.db.groups.find((x) => x.id === a.groupId);
              return { groupId: a.groupId, group: { name: g?.name ?? "" } };
            }),
        };
      });

    return okList(items, total, pg);
  },

  "POST /tests": (ctx) => {
    const teacher = ctx.requireTeacher();
    const body = ctx.body ?? {};
    const title = str(body.title).trim();
    const issues: Issue[] = [];
    if (!title || title.length > 160) issues.push({ path: "title", message: "Title is required" });
    if (Array.isArray(body.skill) || (body.skill && !SKILLS.includes(body.skill))) {
      issues.push({ path: "skill", message: "Invalid skill" });
    }
    if (body.difficulty && !LEVELS.includes(body.difficulty)) issues.push({ path: "difficulty", message: "Invalid level" });
    const { questions, issues: qIssues } = normalizeAndValidate(body.questions);
    issues.push(...qIssues);
    if (!questions.length) issues.push({ path: "questions", message: "Add at least one question" });
    if (issues.length) validationError(issues);

    const id = uid("tst");
    const now = nowIso();
    const test: DbTest = {
      id,
      title,
      description: optStr(body.description)?.slice(0, 2000) ?? null,
      topic: optStr(body.topic)?.slice(0, 80) ?? null,
      skill: (body.skill as Skill) ?? "GRAMMAR",
      difficulty: (body.difficulty as Level) ?? "BEGINNER",
      timeLimitSeconds: clampInt(body.timeLimitSeconds, 30, 14400, Math.max(60, questions.length * 60)) as number,
      passingScore: clampInt(body.passingScore, 0, 100, 60) as number,
      instructions: optStr(body.instructions)?.slice(0, 2000) ?? null,
      type: body.type === "AI" ? "AI" : "MANUAL",
      status: TSTATUSES.includes(body.status) ? body.status : "DRAFT",
      aiPrompt: optStr(body.aiPrompt) ?? null,
      createdById: teacher.id,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mutate((db) => {
      db.tests.push(test);
      persistQuestions(db, id, questions);
    });
    return testDetail(ctx.db, id);
  },

  "GET /tests/:id": (ctx) => {
    ctx.requireTeacher();
    return testDetail(ctx.db, ctx.params.id);
  },

  "PATCH /tests/:id": (ctx) => {
    ctx.requireTeacher();
    const body = ctx.body ?? {};
    const issues: Issue[] = [];
    if (body.title !== undefined && (!str(body.title).trim() || str(body.title).trim().length > 160)) {
      issues.push({ path: "title", message: "Title is required" });
    }
    let questions: QuestionInput[] | null = null;
    if (body.questions !== undefined) {
      const res = normalizeAndValidate(body.questions);
      questions = res.questions;
      issues.push(...res.issues);
      if (!questions.length) issues.push({ path: "questions", message: "Add at least one question" });
    }
    if (issues.length) validationError(issues);

    mutate((db) => {
      const test = db.tests.find((t) => t.id === ctx.params.id && !t.deletedAt);
      if (!test) notFound("Test not found.");
      if (body.title !== undefined) test!.title = str(body.title).trim();
      if (body.description !== undefined) test!.description = optStr(body.description)?.slice(0, 2000) ?? null;
      if (body.topic !== undefined) test!.topic = optStr(body.topic)?.slice(0, 80) ?? null;
      if (body.skill !== undefined && SKILLS.includes(body.skill)) test!.skill = body.skill;
      if (body.difficulty !== undefined && LEVELS.includes(body.difficulty)) test!.difficulty = body.difficulty;
      if (body.timeLimitSeconds !== undefined) test!.timeLimitSeconds = clampInt(body.timeLimitSeconds, 30, 14400, test!.timeLimitSeconds) as number;
      if (body.passingScore !== undefined) test!.passingScore = clampInt(body.passingScore, 0, 100, test!.passingScore) as number;
      if (body.instructions !== undefined) test!.instructions = optStr(body.instructions)?.slice(0, 2000) ?? null;
      if (body.status !== undefined && TSTATUSES.includes(body.status)) test!.status = body.status;
      test!.updatedAt = nowIso();
      if (questions) persistQuestions(db, ctx.params.id, questions);
    });
    return testDetail(ctx.db, ctx.params.id);
  },

  "DELETE /tests/:id": (ctx) => {
    ctx.requireTeacher();
    mutate((db) => {
      const test = db.tests.find((t) => t.id === ctx.params.id && !t.deletedAt);
      if (!test) notFound("Test not found.");
      test!.deletedAt = nowIso();
      test!.status = "ARCHIVED";
    });
    return { id: ctx.params.id, deleted: true };
  },

  "POST /tests/:id/assign": (ctx) => {
    const teacher = ctx.requireTeacher();
    const body = ctx.body ?? {};
    const groupIds: string[] = Array.isArray(body.groupIds) ? body.groupIds.filter((g: unknown) => typeof g === "string" && g) : [];
    const startAt = new Date(body.startAt);
    const deadlineAt = new Date(body.deadlineAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(deadlineAt.getTime())) badRequest("Invalid date.");
    if (deadlineAt <= startAt) {
      throw new HttpError(422, "Please check the highlighted fields.", "VALIDATION_ERROR", [
        { path: "deadlineAt", message: "The deadline must be after the start time." },
      ]);
    }
    if (!groupIds.length) badRequest("Select at least one group.");

    let created: DbAssignment[] = [];
    mutate((db) => {
      const test = db.tests.find((t) => t.id === ctx.params.id && !t.deletedAt);
      if (!test) notFound("Test not found.");
      const groups = db.groups.filter((g) => groupIds.includes(g.id) && g.status === "ACTIVE");
      if (groups.length !== groupIds.length) badRequest("One or more groups could not be found.");
      if (test!.status === "DRAFT") test!.status = "PUBLISHED";

      const duration = clampInt(body.durationSeconds, 30, 14400, test!.timeLimitSeconds) as number;
      const maxAttempts = clampInt(body.maxAttempts, 1, 10, 1) as number;
      created = groups.map((g) => {
        const existing = db.assignments.find((a) => a.testId === test!.id && a.groupId === g.id);
        const now = nowIso();
        if (existing) {
          Object.assign(existing, {
            startAt: startAt.toISOString(),
            deadlineAt: deadlineAt.toISOString(),
            durationSeconds: duration,
            maxAttempts,
            status: "ACTIVE" as const,
            assignedById: teacher.id,
            updatedAt: now,
          });
          return existing;
        }
        const assignment: DbAssignment = {
          id: uid("asg"),
          testId: test!.id,
          groupId: g.id,
          assignedById: teacher.id,
          startAt: startAt.toISOString(),
          deadlineAt: deadlineAt.toISOString(),
          durationSeconds: duration,
          maxAttempts,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        };
        db.assignments.push(assignment);
        return assignment;
      });

      const students = db.users.filter(
        (u) =>
          u.role === "STUDENT" &&
          u.status === "ACTIVE" &&
          !u.deletedAt &&
          db.groupMembers.some((m) => m.studentId === u.id && groupIds.includes(m.groupId)),
      );
      const names = groups.map((g) => g.name).join(", ");
      const due = deadlineAt.toLocaleString();
      students.forEach((s) =>
        pushNotification(db, s.id, "TEST_ASSIGNED", `New test: ${test!.title}`, `${names} • due ${due}`, "/tests"),
      );
    });
    return created;
  },

  "DELETE /tests/:id/assignments/:groupId": (ctx) => {
    ctx.requireTeacher();
    mutate((db) => {
      const assignment = db.assignments.find(
        (a) => a.testId === ctx.params.id && a.groupId === ctx.params.groupId,
      );
      if (!assignment) notFound("Assignment not found.");
      assignment!.status = "CLOSED";
      assignment!.updatedAt = nowIso();
    });
    return { testId: ctx.params.id, groupId: ctx.params.groupId, closed: true };
  },

  "GET /tests/:id/results": (ctx) => {
    ctx.requireTeacher();
    const { id } = ctx.params;
    const groupId = qStr(ctx, "groupId");
    const test = ctx.db.tests.find((t) => t.id === id && !t.deletedAt);
    if (!test) notFound("Test not found.");

    const assignments = ctx.db.assignments
      .filter((a) => a.testId === id && (!groupId || a.groupId === groupId))
      .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
    const groupIds = assignments.map((a) => a.groupId);

    const assignedStudents = new Set(
      ctx.db.groupMembers
        .filter((m) => groupIds.includes(m.groupId))
        .map((m) => m.studentId)
        .filter((sid) => {
          const u = ctx.db.users.find((x) => x.id === sid);
          return u && !u.deletedAt;
        }),
    );

    const attempts = ctx.db.attempts
      .filter(
        (a) =>
          a.testId === id &&
          (a.status === "SUBMITTED" || a.status === "TIME_UP") &&
          (!groupIds.length || (a.assignmentId ? groupIds.includes(ctx.db.assignments.find((x) => x.id === a.assignmentId)?.groupId ?? "") : false)),
      )
      .sort((a, b) => b.percentage - a.percentage);

    const inProgress = ctx.db.attempts.filter((a) => a.testId === id && a.status === "IN_PROGRESS").length;
    const avg = attempts.length ? attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length : 0;
    const avgDuration = attempts.length
      ? attempts.reduce((s, a) => s + (a.durationSeconds ?? 0), 0) / attempts.length
      : 0;
    const passed = attempts.filter((a) => a.percentage >= test.passingScore).length;

    const attemptIds = new Set(attempts.map((a) => a.id));
    const questionAnalysis = questionsOf(ctx.db, id).map((q) => {
      const answers = ctx.db.answers.filter((a) => a.questionId === q.id && attemptIds.has(a.attemptId));
      const answered = answers.filter((a) => a.isCorrect !== null);
      const correct = answers.filter((a) => a.isCorrect === true).length;
      return {
        id: q.id,
        order: q.order,
        text: q.text,
        type: q.type,
        topic: q.topic,
        correctCount: correct,
        answeredCount: answered.length,
        attemptCount: attempts.length,
        correctPct: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
          chosenCount: answers.filter((a) => a.selectedOptionIds.includes(o.id)).length,
        })),
      };
    });

    return {
      test: {
        id: test.id,
        title: test.title,
        topic: test.topic,
        difficulty: test.difficulty,
        passingScore: test.passingScore,
        status: test.status,
      },
      summary: {
        assignedStudents: assignedStudents.size,
        completed: attempts.length,
        inProgress,
        notStarted: Math.max(0, assignedStudents.size - attempts.length - inProgress),
        average: Math.round(avg * 10) / 10,
        highest: attempts.length ? Math.max(...attempts.map((a) => a.percentage)) : 0,
        lowest: attempts.length ? Math.min(...attempts.map((a) => a.percentage)) : 0,
        averageDurationSeconds: Math.round(avgDuration),
        passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : 0,
      },
      assignments: assignments.map((a) => {
        const g = ctx.db.groups.find((x) => x.id === a.groupId);
        return {
          id: a.id,
          group: g ? { id: g.id, name: g.name, level: g.level } : { id: a.groupId, name: "—", level: "BEGINNER" as Level },
          startAt: a.startAt,
          deadlineAt: a.deadlineAt,
          durationSeconds: a.durationSeconds,
          status: a.status,
        };
      }),
      attempts: attempts.map((a) => {
        const u = ctx.db.users.find((x) => x.id === a.userId);
        const assignment = ctx.db.assignments.find((x) => x.id === a.assignmentId);
        const g = assignment ? ctx.db.groups.find((x) => x.id === assignment.groupId) : null;
        return {
          id: a.id,
          student: u
            ? { id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, avatarUrl: u.avatarUrl }
            : { id: a.userId, firstName: "?", lastName: "", username: "?", avatarUrl: null },
          group: g ? { id: g.id, name: g.name } : null,
          score: a.score,
          totalPoints: a.totalPoints,
          percentage: a.percentage,
          durationSeconds: a.durationSeconds,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          status: a.status,
          tabSwitches: a.tabSwitches,
          refreshCount: a.refreshCount,
        };
      }),
      questionAnalysis,
    };
  },

  "GET /assignments": (ctx) => {
    ctx.requireTeacher();
    const pg = page(ctx, 20, 100);
    const groupId = qStr(ctx, "groupId");
    const testId = qStr(ctx, "testId");
    const upcoming = qBool(ctx, "upcoming");
    const now = Date.now();

    const list = ctx.db.assignments.filter((a) => {
      if (a.status !== "ACTIVE") return false;
      if (groupId && a.groupId !== groupId) return false;
      if (testId && a.testId !== testId) return false;
      if (upcoming && new Date(a.deadlineAt).getTime() < now) return false;
      return true;
    });

    const sorted = [...list].sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
    const items = sorted.slice(pg.skip, pg.skip + pg.take).map((a) => {
      const test = ctx.db.tests.find((t) => t.id === a.testId);
      const group = ctx.db.groups.find((g) => g.id === a.groupId);
      const author = ctx.db.users.find((u) => u.id === a.assignedById);
      const studentCount = ctx.db.groupMembers.filter(
        (m) => m.groupId === a.groupId && !ctx.db.users.find((u) => u.id === m.studentId)?.deletedAt,
      ).length;
      const completedCount = ctx.db.attempts.filter(
        (at) => at.assignmentId === a.id && (at.status === "SUBMITTED" || at.status === "TIME_UP"),
      ).length;
      return {
        id: a.id,
        test: test
          ? {
              id: test.id,
              title: test.title,
              topic: test.topic,
              difficulty: test.difficulty,
              timeLimitSeconds: test.timeLimitSeconds,
            }
          : { id: a.testId, title: "—", topic: null, difficulty: "BEGINNER" as Level, timeLimitSeconds: 1200 },
        group: group
          ? { id: group.id, name: group.name, level: group.level }
          : { id: a.groupId, name: "—", level: "BEGINNER" as Level },
        assignedBy: author ? { firstName: author.firstName, lastName: author.lastName } : { firstName: "—", lastName: "" },
        startAt: a.startAt,
        deadlineAt: a.deadlineAt,
        durationSeconds: a.durationSeconds,
        maxAttempts: a.maxAttempts,
        status: a.status,
        completedCount,
        studentCount,
        completionRate: studentCount ? Math.round((completedCount / studentCount) * 100) : 0,
      };
    });

    return okList(items, list.length, pg);
  },
};
