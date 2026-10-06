import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { chatJson, type AiUsage } from "../lib/ai";
import { aiConfigured, env } from "../config/env";
import { z } from "zod";
import type { AiRequestType, Level, Prisma, Skill } from "@prisma/client";

// ───────────────────────── request bookkeeping ─────────────────────────

async function track<T>(
  userId: string,
  type: AiRequestType,
  prompt: string,
  fn: () => Promise<{ result: T; usage: AiUsage }>,
): Promise<T> {
  const request = await prisma.aiRequest.create({
    data: { userId, type, prompt, status: "PENDING", model: env.AI_MODEL },
  });
  const started = Date.now();
  try {
    const { result, usage } = await fn();
    await prisma.aiRequest.update({
      where: { id: request.id },
      data: { status: "SUCCESS", output: result as Prisma.InputJsonValue, durationMs: Date.now() - started, model: usage.model },
    });
    await prisma.aiUsageLog.create({
      data: {
        userId,
        provider: usage.provider,
        model: usage.model,
        requestType: type,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: usage.durationMs,
        status: "success",
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await prisma.aiRequest.update({
      where: { id: request.id },
      data: { status: "ERROR", error: message, durationMs: Date.now() - started },
    });
    await prisma.aiUsageLog.create({
      data: {
        userId,
        provider: env.AI_PROVIDER,
        model: env.AI_MODEL,
        requestType: type,
        durationMs: Date.now() - started,
        status: "error",
      },
    });
    throw err;
  }
}

export function aiStatus() {
  return { configured: aiConfigured, provider: env.AI_PROVIDER, model: aiConfigured ? env.AI_MODEL : null };
}

export async function listRequests(userId: string, type?: AiRequestType) {
  const [items, total] = await Promise.all([
    prisma.aiRequest.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, prompt: true, status: true, model: true, error: true, durationMs: true, createdAt: true },
    }),
    prisma.aiRequest.count({ where: { userId, ...(type ? { type } : {}) } }),
  ]);
  return { items, total };
}

// ───────────────────────── test generation ─────────────────────────

const genQuestion = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"]),
  text: z.string().min(3).max(600),
  options: z.array(z.string().min(1).max(400)).min(2).max(6).optional(),
  correctIndex: z.number().int().min(0).max(10).optional(),
  correctAnswer: z.string().min(1).max(400).optional(),
  explanation: z.string().max(600).optional(),
  points: z.number().int().min(1).max(10).optional(),
  topic: z.string().max(160).optional(),
});

const genTestPayload = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  questions: z.array(genQuestion).min(1).max(50),
});

export type GeneratedQuestion = z.infer<typeof genQuestion>;

export function normalizeGeneratedQuestion(q: GeneratedQuestion): {
  type: GeneratedQuestion["type"];
  text: string;
  options: string[];
  correctIndex: number | null;
  correctAnswerText: string | null;
  explanation?: string;
  points: number;
  topic?: string;
} {
  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
    const options =
      q.type === "TRUE_FALSE"
        ? ["True", "False"]
        : (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) throw ApiError.unprocessable("AI question needs at least 2 options.");

    let correctIndex = q.correctIndex;
    if (correctIndex === undefined || correctIndex >= options.length) {
      if (q.correctAnswer) {
        const idx = options.findIndex((o) => o.toLowerCase() === q.correctAnswer!.trim().toLowerCase());
        if (idx >= 0) correctIndex = idx;
      }
    }
    if (correctIndex === undefined || correctIndex >= options.length) {
      throw ApiError.unprocessable("AI question is missing a valid correctIndex.");
    }
    return {
      type: q.type,
      text: q.text.trim(),
      options,
      correctIndex,
      correctAnswerText: null,
      explanation: q.explanation,
      points: q.points ?? 1,
      topic: q.topic,
    };
  }

  const answer = q.correctAnswer?.trim();
  if (!answer) throw ApiError.unprocessable("AI question is missing correctAnswer.");
  return {
    type: q.type,
    text: q.text.trim(),
    options: [],
    correctIndex: null,
    correctAnswerText: answer,
    explanation: q.explanation,
    points: q.points ?? 1,
    topic: q.topic,
  };
}

export async function generateTest(
  userId: string,
  params: {
    topic: string;
    skill: Skill;
    level: Level;
    questionCount: number;
    title?: string;
    types?: Array<"MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "SHORT_ANSWER">;
  },
) {
  const types = params.types?.length ? params.types : ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK"];
  const system = [
    "You are an expert English language test writer (ELTS/CEFR aligned).",
    "Reply with STRICT JSON only — no commentary, no markdown fences.",
    'Shape: {"title":string,"description":string,"questions":[{"type":"MULTIPLE_CHOICE"|"TRUE_FALSE"|"FILL_BLANK"|"SHORT_ANSWER","text":string,"options":string[] (MC only, 4 options), "correctIndex":number (MC/TF only, 0-based), "correctAnswer":string (fill/short only), "explanation":string, "points":number, "topic":string}]}.',
    "Rules: every question must have exactly one defensible correct answer; distractors must be plausible; use natural, contemporary English; no duplicate questions; vary difficulty within the level.",
  ].join(" ");

  const user = `Create a ${params.questionCount}-question ${params.skill} test about "${params.topic}" for ${params.level} level students. Allowed question types: ${types.join(", ")}. ${params.title ? `Working title: ${params.title}.` : ""}`;

  const payload = await track(userId, "GENERATE_TEST", `${params.topic} | ${params.skill} | ${params.level} | ${params.questionCount}q`, () =>
    chatJson<unknown>({ system, user, temperature: 0.7 }),
  );

  const parsed = genTestPayload.parse(payload);
  if (parsed.questions.length > params.questionCount * 2) {
    throw ApiError.unprocessable("AI returned too many questions.");
  }

  const normalized = parsed.questions.slice(0, params.questionCount).map(normalizeGeneratedQuestion);

  const test = await prisma.test.create({
    data: {
      title: params.title?.trim() || parsed.title,
      description: parsed.description,
      topic: params.topic,
      skill: params.skill,
      difficulty: params.level,
      timeLimitSeconds: Math.max(300, params.questionCount * 90),
      passingScore: 60,
      status: "DRAFT",
      type: "AI",
      aiPrompt: `${params.topic} | ${params.skill} | ${params.level} | ${params.questionCount}q`,
      createdById: userId,
      questions: {
        create: normalized.map((q, index) => ({
          type: q.type,
          text: q.text,
          topic: q.topic ?? params.topic,
          explanation: q.explanation,
          correctAnswer: q.correctAnswerText ?? (q.correctIndex !== null ? String(q.correctIndex) : null),
          order: index,
          points: q.points,
          options:
            q.options.length > 0
              ? {
                  create: q.options.map((text, i) => ({
                    text,
                    isCorrect: i === q.correctIndex,
                    order: i,
                  })),
                }
              : undefined,
        })),
      },
    },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });

  return test;
}

// ───────────────────────── question regeneration ─────────────────────────

export async function regenerateQuestion(userId: string, questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { test: true, options: { orderBy: { order: "asc" } } },
  });
  if (!question) throw ApiError.notFound("Question not found.");

  const system = [
    "You are an expert English test item writer.",
    "Reply with STRICT JSON only.",
    `Shape: {"text":string,"options":string[] (same type semantics as input, MC/TF only), "correctIndex":number (MC/TF), "correctAnswer":string (fill/short), "explanation":string}.`,
    "Rewrite the given question to be clearer and more accurate while testing the same skill and difficulty. Do not make it easier by giving away the answer.",
  ].join(" ");

  const current = {
    type: question.type,
    text: question.text,
    options: question.options.map((o) => o.text),
    correctAnswer: question.correctAnswer,
  };

  const payload = await track(userId, "REGENERATE_QUESTION", question.text.slice(0, 300), () =>
    chatJson<unknown>({ system, user: JSON.stringify({ test: question.test.title, question: current }), temperature: 0.6 }),
  );

  const parsed = genQuestion.parse(payload);
  const normalized = normalizeGeneratedQuestion({
    ...parsed,
    type: (["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(parsed.type)
      ? parsed.type
      : question.type) as GeneratedQuestion["type"],
  });

  const data = {
    text: normalized.text,
    explanation: normalized.explanation ?? question.explanation,
    correctAnswer: normalized.correctAnswerText ?? (normalized.correctIndex !== null ? String(normalized.correctIndex) : question.correctAnswer),
  };

  if (normalized.options.length > 0) {
    await prisma.questionOption.deleteMany({ where: { questionId } });
    await prisma.question.update({
      where: { id: questionId },
      data: {
        ...data,
        options: {
          create: normalized.options.map((text, i) => ({
            text,
            isCorrect: i === normalized.correctIndex,
            order: i,
          })),
        },
      },
      include: { options: { orderBy: { order: "asc" } } },
    });
  } else {
    await prisma.question.update({ where: { id: questionId }, data });
  }

  return prisma.question.findUnique({ where: { id: questionId }, include: { options: { orderBy: { order: "asc" } } } });
}

// ───────────────────────── writing analysis ─────────────────────────

const writingAnalysis = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  corrections: z
    .array(z.object({ original: z.string(), corrected: z.string(), note: z.string().optional() }))
    .default([]),
});

export type WritingAnalysis = z.infer<typeof writingAnalysis>;

export async function analyzeWriting(
  userId: string,
  input: { text: string; instructions?: string; minWords?: number; maxWords?: number },
) {
  const system = [
    "You are a meticulous English writing examiner (CEFR-aligned).",
    "Reply with STRICT JSON only.",
    'Shape: {"score":number(0-100),"feedback":string,"strengths":string[],"improvements":string[],"corrections":[{"original":string,"corrected":string,"note":string}]}.',
    "Score fairly against the task requirements. Feedback must be concrete and actionable. Corrections: only genuine language errors (grammar, word choice, spelling, style) — max 15 entries.",
  ].join(" ");

  const user = [
    input.instructions ? `Task: ${input.instructions}` : "General writing task.",
    `Word limits: ${input.minWords ?? 100}-${input.maxWords ?? 400} words.`,
    `Student text:\n"""\n${input.text.slice(0, 12000)}\n"""`,
  ].join("\n\n");

  const payload = await track(userId, "ANALYZE_WRITING", input.text.slice(0, 300), () =>
    chatJson<unknown>({ system, user, temperature: 0.3 }),
  );
  return writingAnalysis.parse(payload);
}

// ───────────────────────── student / group insights ─────────────────────────

const insight = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

export type Insight = z.infer<typeof insight>;

export async function analyzeStudent(userId: string, studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", deletedAt: null },
    select: {
      firstName: true,
      lastName: true,
      streak: { select: { currentStreak: true, longestStreak: true } },
      skillProgress: true,
      attempts: {
        where: { status: { in: ["SUBMITTED", "TIME_UP"] } },
        select: { percentage: true, submittedAt: true, test: { select: { title: true, skill: true } } },
        orderBy: { submittedAt: "desc" },
        take: 30,
      },
    },
  });
  if (!student) throw ApiError.notFound("Student not found.");

  const data = {
    student: `${student.firstName} ${student.lastName}`,
    streak: student.streak,
    skills: student.skillProgress.map((p) => ({
      skill: p.skill,
      average: p.averagePercentage,
      accuracy: p.totalAnswers ? Math.round((p.correctAnswers / p.totalAnswers) * 100) : 0,
      completed: p.completedCount,
    })),
    recentAttempts: student.attempts.map((a) => ({ skill: a.test.skill, score: a.percentage, date: a.submittedAt })),
  };

  return track(userId, "ANALYZE_STUDENT", `${studentId} | ${JSON.stringify(data).slice(0, 200)}`, () =>
    chatJson<unknown>({
      system: [
        "You are an experienced English teacher reviewing one learner's data.",
        "Reply with STRICT JSON only.",
        'Shape: {"summary":string,"strengths":string[],"risks":string[],"recommendations":string[]}.',
        "Be specific and reference the actual numbers.",
      ].join(" "),
      user: JSON.stringify(data),
      temperature: 0.4,
    }),
  ).then((raw) => insight.parse(raw));
}

export async function analyzeGroup(userId: string, groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { include: { student: { select: { firstName: true, lastName: true } } } },
      assignments: {
        take: 20,
        orderBy: { deadlineAt: "desc" },
        include: {
          test: { select: { title: true, skill: true } },
          attempts: { select: { percentage: true, status: true } },
        },
      },
    },
  });
  if (!group) throw ApiError.notFound("Group not found.");

  const data = {
    group: group.name,
    level: group.level,
    students: group.members.map((m) => `${m.student.firstName} ${m.student.lastName}`),
    assignments: group.assignments.map((a) => ({
      test: a.test.title,
      skill: a.test.skill,
      scores: a.attempts.filter((x) => x.status !== "IN_PROGRESS").map((x) => x.percentage),
    })),
  };

  return track(userId, "ANALYZE_GROUP", `${groupId} | ${group.name}`, () =>
    chatJson<unknown>({
      system: [
        "You are an experienced English teacher reviewing one group's performance.",
        "Reply with STRICT JSON only.",
        'Shape: {"summary":string,"strengths":string[],"risks":string[],"recommendations":string[]}.',
      ].join(" "),
      user: JSON.stringify(data),
      temperature: 0.4,
    }),
  ).then((raw) => insight.parse(raw));
}
