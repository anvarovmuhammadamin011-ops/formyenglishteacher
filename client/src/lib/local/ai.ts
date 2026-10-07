import { z } from "zod";
import { chatJson, getAiConfig, isAiConfigured } from "@/lib/ai";
import { mutate, nowIso, uid } from "@/lib/db";
import type {
  AiRequestRow,
  AiStatus,
  Db,
  DbQuestion,
  DbTest,
} from "@/lib/types";
import { type Ctx, type Handler, HttpError, notFound } from "@/lib/local/core";

const GENERATED_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"] as const;
type GeneratedType = (typeof GENERATED_TYPES)[number];

const generateSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  skill: z.enum(["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"]),
  level: z.enum([
    "BEGINNER",
    "ELEMENTARY",
    "PRE_INTERMEDIATE",
    "INTERMEDIATE",
    "UPPER_INTERMEDIATE",
    "ADVANCED",
  ]),
  questionCount: z.coerce.number().int().min(3).max(30),
  title: z.string().trim().max(200).optional(),
  types: z.array(z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"])).min(1).optional(),
});

type Issue = { path: string; message: string };

function toIssues(error: unknown): Issue[] {
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return (issues as unknown[]).map((issue) => {
    const raw = issue as { path?: unknown; message?: unknown };
    const path = Array.isArray(raw.path) ? raw.path.map((part) => String(part)).join(".") : "";
    return { path, message: typeof raw.message === "string" ? raw.message : "Invalid value" };
  });
}

function invalidOutput(message: string): never {
  throw new HttpError(400, message, "AI_INVALID_OUTPUT");
}

type NormalizedQuestion = {
  type: GeneratedType;
  text: string;
  options: string[];
  correctIndex: number | null;
  correctAnswerText: string | null;
  explanation: string | null;
  points: number;
  topic: string | null;
};

type GeneratedTest = {
  title: string;
  description: string | null;
  questions: NormalizedQuestion[];
};

function normalizeQuestion(raw: unknown, position: number): NormalizedQuestion {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    invalidOutput(`AI question ${position} is not a valid object.`);
  }
  const q = raw as Record<string, unknown>;
  const rawType = q.type;
  if (typeof rawType !== "string" || !GENERATED_TYPES.includes(rawType as GeneratedType)) {
    invalidOutput(`AI question ${position} has an unsupported question type.`);
  }
  const type = rawType as GeneratedType;
  const text = typeof q.text === "string" ? q.text.trim() : "";
  if (text.length < 3 || text.length > 600) {
    invalidOutput(`AI question ${position} must contain between 3 and 600 characters.`);
  }

  const explanation =
    typeof q.explanation === "string" ? q.explanation.trim().slice(0, 600) : null;
  const topic = typeof q.topic === "string" ? q.topic.trim().slice(0, 160) : null;
  const rawPoints = Number(q.points);
  const points =
    Number.isFinite(rawPoints) && rawPoints >= 1 ? Math.min(100, Math.trunc(rawPoints)) : 1;

  if (type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE") {
    const options =
      type === "TRUE_FALSE"
        ? ["True", "False"]
        : Array.isArray(q.options)
          ? q.options
              .map((o) => (typeof o === "string" ? o.trim() : ""))
              .filter((o) => o.length > 0)
              .slice(0, 8)
          : [];
    if (options.length < 2) {
      invalidOutput(`AI question ${position} needs at least 2 options.`);
    }

    let correctIndex: number | undefined;
    if (typeof q.correctIndex === "number" && Number.isInteger(q.correctIndex)) {
      correctIndex = q.correctIndex;
    } else if (typeof q.correctIndex === "string" && /^\d+$/.test(q.correctIndex.trim())) {
      correctIndex = Number(q.correctIndex.trim());
    }
    if (correctIndex === undefined || correctIndex < 0 || correctIndex >= options.length) {
      const answer = typeof q.correctAnswer === "string" ? q.correctAnswer.trim().toLowerCase() : "";
      const matched = answer ? options.findIndex((o) => o.toLowerCase() === answer) : -1;
      correctIndex = matched >= 0 ? matched : undefined;
    }
    if (correctIndex === undefined || correctIndex >= options.length) {
      invalidOutput(`AI question ${position} is missing a valid correct answer.`);
    }

    return {
      type,
      text,
      options,
      correctIndex,
      correctAnswerText: null,
      explanation,
      points,
      topic,
    };
  }

  const answer = typeof q.correctAnswer === "string" ? q.correctAnswer.trim() : "";
  if (!answer) {
    invalidOutput(`AI question ${position} is missing correctAnswer.`);
  }
  return {
    type,
    text,
    options: [],
    correctIndex: null,
    correctAnswerText: answer,
    explanation,
    points,
    topic,
  };
}

function parseGenerated(payload: unknown, questionCount: number): GeneratedTest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalidOutput("AI returned an unexpected response format.");
  }
  const body = payload as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3 || title.length > 200) {
    invalidOutput("AI returned an invalid test title.");
  }
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (!Array.isArray(body.questions)) {
    invalidOutput("AI returned no questions.");
  }
  const rawQuestions: unknown[] = body.questions;
  if (!rawQuestions.length) {
    invalidOutput("AI returned no questions.");
  }
  if (rawQuestions.length > 50 || rawQuestions.length > questionCount * 2) {
    invalidOutput("AI returned too many questions.");
  }
  return {
    title,
    description: description || null,
    questions: rawQuestions.map((q, i) => normalizeQuestion(q, i + 1)),
  };
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
  const author = db.users.find((u) => u.id === test.createdById);
  const attempts = db.attempts.filter((a) => a.testId === id);
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    topic: test.topic,
    skill: test.skill,
    difficulty: test.difficulty,
    timeLimitSeconds: test.timeLimitSeconds,
    passingScore: test.passingScore,
    instructions: test.instructions,
    type: test.type,
    status: test.status,
    aiPrompt: test.aiPrompt,
    createdAt: test.createdAt,
    updatedAt: test.updatedAt,
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
          attempts: attempts.filter(
            (at) => at.assignmentId === a.id && (at.status === "SUBMITTED" || at.status === "TIME_UP"),
          ).length,
        },
      })),
    _count: {
      questions: db.questions.filter((q) => q.testId === id).length,
      attempts: attempts.filter((a) => a.status === "SUBMITTED" || a.status === "TIME_UP").length,
    },
  };
}

export const aiRoutes: Record<string, Handler> = {
  "GET /ai/status": (ctx: Ctx) => {
    ctx.requireUser();
    const configured = isAiConfigured();
    const cfg = getAiConfig();
    const status: AiStatus = {
      configured,
      provider: cfg.provider,
      model: configured ? cfg.model : null,
    };
    return status;
  },

  "GET /ai/requests": (ctx: Ctx) => {
    ctx.requireUser();
    const type = ctx.query.type || undefined;
    const rows = ctx.db.aiRequests
      .filter((r) => (type ? r.type === type : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const items: AiRequestRow[] = rows.slice(0, 50).map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      prompt: r.prompt,
      model: r.model,
      inputTokens: r.promptTokens,
      outputTokens: r.completionTokens,
      durationMs: r.durationMs,
      error: r.error,
      createdAt: r.createdAt,
    }));
    return { items, total: rows.length };
  },

  "POST /ai/generate-test": async (ctx: Ctx) => {
    const teacher = ctx.requireTeacher();

    if (!isAiConfigured()) {
      throw new HttpError(
        400,
        "AI kaliti kiritilmagan. Settings → AI bo'limidan API kalitingizni kiriting.",
        "AI_NOT_CONFIGURED",
      );
    }

    const parsed = generateSchema.safeParse(ctx.body ?? {});
    if (!parsed.success) {
      throw new HttpError(
        422,
        "Please check the highlighted fields.",
        "VALIDATION_ERROR",
        toIssues(parsed.error),
      );
    }
    const input = parsed.data;
    const types: GeneratedType[] = input.types?.length
      ? input.types
      : ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK"];

    const system = [
      "You are an expert English language test writer (ELTS/CEFR aligned).",
      "Reply with STRICT JSON only — no commentary, no markdown fences.",
      'Shape: {"title":string,"description":string,"questions":[{"type":"MULTIPLE_CHOICE"|"TRUE_FALSE"|"FILL_BLANK"|"SHORT_ANSWER","text":string,"options":string[] (MC only, 4 options), "correctIndex":number (MC/TF only, 0-based), "correctAnswer":string (fill/short only), "explanation":string, "points":number, "topic":string}]}.',
      "Rules: every question must have exactly one defensible correct answer; distractors must be plausible; use natural, contemporary English; no duplicate questions; vary difficulty within the level.",
    ].join(" ");

    const userMessage = `Create a ${input.questionCount}-question ${input.skill} test about "${input.topic}" for ${input.level} level students. Allowed question types: ${types.join(", ")}. ${input.title ? `Working title: ${input.title}.` : ""}`;

    const payload = await chatJson<unknown>({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      requestType: "GENERATE_TEST",
      temperature: 0.7,
    });

    const generated = parseGenerated(payload, input.questionCount);
    const aiPrompt = `${input.topic} | ${input.skill} | ${input.level} | ${input.questionCount}q`;

    const testId = mutate((db) => {
      const now = nowIso();
      const test: DbTest = {
        id: uid("tst"),
        title: input.title?.trim() || generated.title,
        description: generated.description,
        topic: input.topic,
        skill: input.skill,
        difficulty: input.level,
        timeLimitSeconds: Math.max(300, input.questionCount * 90),
        passingScore: 60,
        instructions: null,
        type: "AI",
        status: "DRAFT",
        aiPrompt,
        createdById: teacher.id,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.tests.push(test);

      generated.questions.slice(0, input.questionCount).forEach((q, index) => {
        const question: DbQuestion = {
          id: uid("qst"),
          testId: test.id,
          type: q.type,
          text: q.text,
          topic: q.topic ?? input.topic,
          explanation: q.explanation,
          correctAnswer:
            q.correctAnswerText ?? (q.correctIndex !== null ? String(q.correctIndex) : null),
          order: index,
          points: q.points,
          createdAt: now,
          updatedAt: now,
        };
        db.questions.push(question);
        q.options.forEach((text, optionIndex) => {
          db.questionOptions.push({
            id: uid("opt"),
            questionId: question.id,
            text,
            isCorrect: q.correctIndex !== null && optionIndex === q.correctIndex,
            order: optionIndex,
          });
        });
      });

      return test.id;
    });

    return testDetail(ctx.db, testId);
  },
};
