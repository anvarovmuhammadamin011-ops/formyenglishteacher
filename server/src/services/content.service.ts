import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { recordMeaningfulActivity, logActivity, notify } from "./system.service";
import type { Level, Prisma, Skill, VocabularyStatus } from "@prisma/client";

function pageSlice<T extends { page?: number; limit?: number }>(q: T) {
  return { skip: ((q.page ?? 1) - 1) * (q.limit ?? 20), take: q.limit ?? 20 };
}

async function allStudentIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: "STUDENT", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Rolling update of the per-skill StudentProgress row after a completed activity. */
async function bumpProgress(
  userId: string,
  skill: Skill,
  opts: { completed?: number; correct?: number; total?: number; percentage?: number; seconds?: number },
) {
  const existing = await prisma.studentProgress.findUnique({ where: { userId_skill: { userId, skill } } });
  const completed = opts.completed ?? 0;
  const correct = opts.correct ?? 0;
  const total = opts.total ?? 0;

  if (!existing) {
    await prisma.studentProgress.create({
      data: {
        userId,
        skill,
        completedCount: completed,
        correctAnswers: correct,
        totalAnswers: total,
        totalSeconds: opts.seconds ?? 0,
        averagePercentage: opts.percentage ?? 0,
        lastActivityAt: new Date(),
      },
    });
    return;
  }

  const prevCompleted = existing.completedCount;
  const nextCompleted = prevCompleted + completed;
  const nextAvg =
    opts.percentage !== undefined && nextCompleted > 0
      ? (existing.averagePercentage * prevCompleted + opts.percentage * completed) / nextCompleted
      : existing.averagePercentage;

  await prisma.studentProgress.update({
    where: { id: existing.id },
    data: {
      completedCount: nextCompleted,
      correctAnswers: existing.correctAnswers + correct,
      totalAnswers: existing.totalAnswers + total,
      totalSeconds: existing.totalSeconds + (opts.seconds ?? 0),
      averagePercentage: Math.round(nextAvg * 100) / 100,
      lastActivityAt: new Date(),
    },
  });
}

// ───────────────────────── Vocabulary ─────────────────────────

export async function vocabularyCategories() {
  const rows = await prisma.vocabulary.groupBy({ by: ["category"], _count: true });
  return rows
    .filter((r) => r.category)
    .map((r) => ({ category: r.category as string, count: r._count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export async function listVocabulary(
  userId: string,
  q: { page: number; limit: number; search?: string; level?: Level; category?: string; status?: VocabularyStatus },
) {
  const where: Prisma.VocabularyWhereInput = {
    ...(q.search ? { OR: [{ word: { contains: q.search, mode: "insensitive" } }, { uzbek: { contains: q.search, mode: "insensitive" } }] } : {}),
    ...(q.level ? { level: q.level } : {}),
    ...(q.category ? { category: q.category } : {}),
  };

  const [items, total, progress] = await Promise.all([
    prisma.vocabulary.findMany({
      where,
      orderBy: [{ category: "asc" }, { word: "asc" }],
      ...pageSlice(q),
    }),
    prisma.vocabulary.count({ where }),
    prisma.vocabularyProgress.findMany({ where: { userId } }),
  ]);
  const progressByWord = new Map(progress.map((p) => [p.vocabularyId, p]));

  let filtered = items.map((v) => {
    const p = progressByWord.get(v.id);
    return {
      id: v.id,
      word: v.word,
      uzbek: v.uzbek,
      russian: v.russian,
      example: v.example,
      pronunciation: v.pronunciation,
      category: v.category,
      level: v.level,
      status: p?.status ?? "NEW",
      correctCount: p?.correctCount ?? 0,
      wrongCount: p?.wrongCount ?? 0,
      masteredAt: p?.masteredAt ?? null,
    };
  });

  if (q.status) filtered = filtered.filter((v) => v.status === q.status);

  return { items: filtered, total: q.status ? filtered.length : total };
}

export async function vocabularyStats(userId: string) {
  const [total, progress] = await Promise.all([
    prisma.vocabulary.count(),
    prisma.vocabularyProgress.findMany({ where: { userId } }),
  ]);
  const learned = progress.filter((p) => p.status === "LEARNED").length;
  const learning = progress.filter((p) => p.status === "LEARNING").length;
  const correct = progress.reduce((s, p) => s + p.correctCount, 0);
  const wrong = progress.reduce((s, p) => s + p.wrongCount, 0);
  return {
    total,
    learned,
    learning,
    new: total - learned - learning,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
  };
}

export async function practiceVocabulary(userId: string, vocabularyId: string, correct: boolean) {
  const word = await prisma.vocabulary.findUnique({ where: { id: vocabularyId } });
  if (!word) throw ApiError.notFound("Word not found.");

  const existing = await prisma.vocabularyProgress.findUnique({
    where: { userId_vocabularyId: { userId, vocabularyId } },
  });

  const correctCount = (existing?.correctCount ?? 0) + (correct ? 1 : 0);
  const wrongCount = (existing?.wrongCount ?? 0) + (correct ? 0 : 1);
  const status: VocabularyStatus = correctCount >= 3 ? "LEARNED" : correctCount + wrongCount > 0 ? "LEARNING" : "NEW";
  const masteredAt = status === "LEARNED" ? existing?.masteredAt ?? new Date() : null;

  const saved = await prisma.vocabularyProgress.upsert({
    where: { userId_vocabularyId: { userId, vocabularyId } },
    create: { userId, vocabularyId, status, correctCount, wrongCount, masteredAt },
    update: { status, correctCount, wrongCount, masteredAt },
  });

  await bumpProgress(userId, "VOCABULARY", {
    correct: correct ? 1 : 0,
    total: 1,
    seconds: 5,
  });
  await recordMeaningfulActivity(userId);
  await logActivity(userId, "VOCABULARY_PRACTICE", { vocabularyId, correct, status });

  return { status: saved.status, correctCount: saved.correctCount, wrongCount: saved.wrongCount, masteredAt: saved.masteredAt };
}

export async function createVocabulary(
  teacherId: string,
  data: { word: string; uzbek: string; russian?: string; example?: string; pronunciation?: string; category?: string; level: Level },
) {
  const created = await prisma.vocabulary.create({ data: { ...data, createdById: teacherId } });
  return created;
}

export async function updateVocabulary(id: string, data: Partial<{ word: string; uzbek: string; russian: string | null; example: string | null; pronunciation: string | null; category: string | null; level: Level }>) {
  const existing = await prisma.vocabulary.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Word not found.");
  return prisma.vocabulary.update({ where: { id }, data });
}

export async function deleteVocabulary(id: string) {
  const existing = await prisma.vocabulary.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Word not found.");
  await prisma.vocabulary.delete({ where: { id } });
  return { id };
}

// ───────────────── Reading & Listening (shared shape) ─────────────────

type MaterialKind = "reading" | "listening";

async function loadMaterial(kind: MaterialKind, id: string, teacherMode: boolean) {
  const where = teacherMode ? { id } : { id, status: "PUBLISHED" as const };
  const material =
    kind === "reading"
      ? await prisma.readingMaterial.findFirst({
          where,
          include: { questions: { orderBy: { order: "asc" } } },
        })
      : await prisma.listeningMaterial.findFirst({
          where,
          include: { questions: { orderBy: { order: "asc" } } },
        });
  if (!material) throw ApiError.notFound(kind === "reading" ? "Reading not found." : "Listening not found.");
  return material;
}

export async function listMaterials(kind: MaterialKind, userId: string, role: "TEACHER" | "STUDENT", q: { page: number; limit: number; search?: string; level?: Level }) {
  const where = {
    ...(role === "STUDENT" ? { status: "PUBLISHED" as const } : {}),
    ...(q.level ? { level: q.level } : {}),
    ...(q.search ? { title: { contains: q.search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] =
    kind === "reading"
      ? await Promise.all([
          prisma.readingMaterial.findMany({ where, orderBy: { createdAt: "desc" }, ...pageSlice(q), include: { _count: { select: { questions: true } } } }),
          prisma.readingMaterial.count({ where }),
        ])
      : await Promise.all([
          prisma.listeningMaterial.findMany({ where, orderBy: { createdAt: "desc" }, ...pageSlice(q), include: { _count: { select: { questions: true } } } }),
          prisma.listeningMaterial.count({ where }),
        ]);

  const myAttempts =
    kind === "reading"
      ? await prisma.readingAttempt.findMany({ where: { userId }, orderBy: { submittedAt: "desc" } })
      : await prisma.listeningAttempt.findMany({ where: { userId }, orderBy: { submittedAt: "desc" } });

  const bestByMaterial = new Map<string, { best: number; count: number }>();
  for (const a of myAttempts) {
    const b = bestByMaterial.get(a.materialId);
    if (b) {
      b.count += 1;
      b.best = Math.max(b.best, a.percentage);
    } else {
      bestByMaterial.set(a.materialId, { best: a.percentage, count: 1 });
    }
  }

  const enriched = items.map((m) => {
    const mine = bestByMaterial.get(m.id);
    const base: Record<string, unknown> = {
      id: m.id,
      title: m.title,
      level: m.level,
      topic: m.topic,
      status: m.status,
      estimatedMinutes: m.estimatedMinutes,
      questions: m._count?.questions ?? 0,
      attempts: mine?.count ?? 0,
      bestScore: mine?.best ?? null,
      createdAt: m.createdAt,
    };
    if (kind === "listening") base.audioUrl = (m as { audioUrl: string }).audioUrl;
    if (role === "TEACHER") base.createdAt = m.createdAt;
    return base;
  });

  return { items: enriched, total };
}

export async function getMaterial(kind: MaterialKind, id: string, user: { id: string; role: "TEACHER" | "STUDENT" }) {
  const material = await loadMaterial(kind, id, user.role === "TEACHER");

  const attempts =
    kind === "reading"
      ? await prisma.readingAttempt.findMany({ where: { userId: user.id, materialId: id }, orderBy: { startedAt: "desc" } })
      : await prisma.listeningAttempt.findMany({ where: { userId: user.id, materialId: id }, orderBy: { startedAt: "desc" } });

  const unlocked = user.role === "TEACHER" || attempts.some((a) => a.submittedAt);
  const questions = material.questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    order: q.order,
    points: q.points,
    ...(unlocked ? { correctAnswer: q.correctAnswer } : {}),
  }));

  const base = {
    id: material.id,
    title: material.title,
    level: material.level,
    topic: material.topic,
    status: material.status,
    estimatedMinutes: material.estimatedMinutes,
    questions,
    transcriptUnlocked: unlocked,
    attempts: attempts.map((a) => ({
      id: a.id,
      submittedAt: a.submittedAt,
      percentage: a.percentage,
      score: a.score,
      totalPoints: a.totalPoints,
      durationSeconds: a.durationSeconds,
    })),
  };

  if (kind === "reading") {
    const m = material as unknown as { text: string };
    return { ...base, text: m.text };
  }
  const m = material as unknown as { audioUrl: string; transcript: string | null };
  return {
    ...base,
    audioUrl: m.audioUrl,
    transcript: unlocked ? m.transcript : null,
  };
}

export async function submitMaterial(
  kind: MaterialKind,
  id: string,
  user: { id: string; role: "TEACHER" | "STUDENT" },
  data: { answers: Array<{ questionId: string; selectedIndex?: number; answerText?: string }>; durationSeconds?: number },
) {
  const material = await loadMaterial(kind, id, user.role === "TEACHER");
  const byId = new Map(material.questions.map((q) => [q.id, q]));

  let score = 0;
  let totalPoints = 0;
  const detail: Array<{ questionId: string; correct: boolean; selectedIndex?: number; correctIndex?: number }> = [];

  for (const a of data.answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    totalPoints += q.points;
    const correctIndex = Number(q.correctAnswer);
    const correct = a.selectedIndex !== undefined && a.selectedIndex === correctIndex;
    if (correct) score += q.points;
    detail.push({ questionId: a.questionId, correct, selectedIndex: a.selectedIndex, correctIndex });
  }
  const unanswered = material.questions.length - data.answers.length;
  for (const q of material.questions) {
    if (!data.answers.some((a) => a.questionId === q.id)) totalPoints += q.points;
  }
  const percentage = totalPoints ? Math.round((score / totalPoints) * 1000) / 10 : 0;

  const attempt =
    kind === "reading"
      ? await prisma.readingAttempt.create({
          data: {
            userId: user.id,
            materialId: id,
            score,
            totalPoints,
            percentage,
            durationSeconds: data.durationSeconds ?? null,
            answers: detail as unknown as Prisma.InputJsonValue,
            submittedAt: new Date(),
          },
        })
      : await prisma.listeningAttempt.create({
          data: {
            userId: user.id,
            materialId: id,
            score,
            totalPoints,
            percentage,
            durationSeconds: data.durationSeconds ?? null,
            answers: detail as unknown as Prisma.InputJsonValue,
            submittedAt: new Date(),
          },
        });

  const skill: Skill = kind === "reading" ? "READING" : "LISTENING";
  await bumpProgress(user.id, skill, {
    completed: 1,
    correct: detail.filter((d) => d.correct).length,
    total: material.questions.length,
    percentage,
    seconds: data.durationSeconds ?? 0,
  });
  await recordMeaningfulActivity(user.id);
  await logActivity(user.id, kind === "reading" ? "READING_COMPLETED" : "LISTENING_COMPLETED", {
    materialId: id,
    percentage,
  });

  return {
    attemptId: attempt.id,
    score,
    totalPoints,
    percentage,
    correct: detail.filter((d) => d.correct).length,
    wrong: detail.filter((d) => !d.correct).length,
    unanswered,
    detail: unlockedDetail(kind, id, user.id),
  };
}

async function unlockedDetail(kind: MaterialKind, materialId: string, userId: string) {
  const material = await loadMaterial(kind, materialId, true);
  return material.questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points,
  }));
}

export async function createMaterial(
  kind: MaterialKind,
  teacherId: string,
  data: { title: string; level: Level; topic?: string; estimatedMinutes?: number; status: "DRAFT" | "PUBLISHED"; text?: string; audioUrl?: string; transcript?: string; questions?: Array<{ text: string; options: string[]; correctAnswer: string; points?: number }> },
) {
  const questions = (data.questions ?? []).map((q, i) => ({ ...q, order: i, points: q.points ?? 1 }));

  if (kind === "reading") {
    if (!data.text) throw ApiError.badRequest("Text is required for reading material.");
    const created = await prisma.readingMaterial.create({
      data: {
        title: data.title,
        level: data.level,
        topic: data.topic,
        text: data.text,
        estimatedMinutes: data.estimatedMinutes ?? 5,
        status: data.status,
        createdById: teacherId,
        questions: { create: questions },
      },
      include: { _count: { select: { questions: true } } },
    });
    if (data.status === "PUBLISHED") {
      await notify(await allStudentIds(), {
        type: "NEW_READING",
        title: `New reading: ${data.title}`,
        body: `Level: ${data.level}`,
        link: "/reading",
      });
    }
    return created;
  }

  if (!data.audioUrl) throw ApiError.badRequest("audioUrl is required for listening material.");
  const created = await prisma.listeningMaterial.create({
    data: {
      title: data.title,
      level: data.level,
      topic: data.topic,
      audioUrl: data.audioUrl,
      transcript: data.transcript,
      estimatedMinutes: data.estimatedMinutes ?? 4,
      status: data.status,
      createdById: teacherId,
      questions: { create: questions },
    },
    include: { _count: { select: { questions: true } } },
  });
  if (data.status === "PUBLISHED") {
    await notify(await allStudentIds(), {
      type: "NEW_LISTENING",
      title: `New listening: ${data.title}`,
      body: `Level: ${data.level}`,
      link: "/listening",
    });
  }
  return created;
}

export async function updateMaterial(
  kind: MaterialKind,
  id: string,
  data: { title?: string; level?: Level; topic?: string | null; estimatedMinutes?: number; status?: "DRAFT" | "PUBLISHED"; text?: string; audioUrl?: string; transcript?: string | null },
) {
  if (kind === "reading") {
    const existing = await prisma.readingMaterial.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Reading not found.");
    return prisma.readingMaterial.update({ where: { id }, data });
  }
  const existing = await prisma.listeningMaterial.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Listening not found.");
  return prisma.listeningMaterial.update({ where: { id }, data });
}

export async function deleteMaterial(kind: MaterialKind, id: string) {
  if (kind === "reading") {
    const existing = await prisma.readingMaterial.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Reading not found.");
    await prisma.readingMaterial.delete({ where: { id } });
    return { id };
  }
  const existing = await prisma.listeningMaterial.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Listening not found.");
  await prisma.listeningMaterial.delete({ where: { id } });
  return { id };
}

export async function materialAttempts(kind: MaterialKind, id: string) {
  const rows =
    kind === "reading"
      ? await prisma.readingAttempt.findMany({
          where: { materialId: id },
          orderBy: { submittedAt: "desc" },
          include: { user: { select: { firstName: true, lastName: true, username: true } } },
        })
      : await prisma.listeningAttempt.findMany({
          where: { materialId: id },
          orderBy: { submittedAt: "desc" },
          include: { user: { select: { firstName: true, lastName: true, username: true } } },
        });
  return rows.map((a) => ({
    id: a.id,
    user: a.user,
    percentage: a.percentage,
    score: a.score,
    totalPoints: a.totalPoints,
    durationSeconds: a.durationSeconds,
    submittedAt: a.submittedAt,
  }));
}

// ───────────────────────── Writing ─────────────────────────

export async function listWriting(userId: string, role: "TEACHER" | "STUDENT", q: { page: number; limit: number }) {
  const where = role === "TEACHER" ? {} : { status: "PUBLISHED" as const };
  const [items, total] = await Promise.all([
    prisma.writingAssignment.findMany({
      where,
      orderBy: { dueAt: "asc" },
      ...pageSlice(q),
      include: {
        _count: { select: { submissions: true } },
        submissions: role === "STUDENT" ? { where: { userId } } : false,
      },
    }),
    prisma.writingAssignment.count({ where }),
  ]);

  const enriched = items.map((a) => {
    const mine = role === "STUDENT" ? (a.submissions as Array<{ status: string; score: number | null }>)?.[0] : undefined;
    return {
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      minWords: a.minWords,
      maxWords: a.maxWords,
      level: a.level,
      topic: a.topic,
      dueAt: a.dueAt,
      status: a.status,
      submissions: a._count.submissions,
      ...(role === "STUDENT"
        ? {
            myStatus: mine?.status ?? null,
            myScore: mine?.score ?? null,
            submitted: Boolean(mine),
          }
        : {}),
    };
  });
  return { items: enriched, total };
}

export async function getWriting(id: string, user: { id: string; role: "TEACHER" | "STUDENT" }) {
  const assignment = await prisma.writingAssignment.findFirst({
    where: user.role === "TEACHER" ? { id } : { id, status: "PUBLISHED" },
  });
  if (!assignment) throw ApiError.notFound("Writing assignment not found.");

  const mine =
    user.role === "STUDENT"
      ? await prisma.writingSubmission.findUnique({ where: { assignmentId_userId: { assignmentId: id, userId: user.id } } })
      : null;

  return {
    id: assignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    minWords: assignment.minWords,
    maxWords: assignment.maxWords,
    level: assignment.level,
    topic: assignment.topic,
    dueAt: assignment.dueAt,
    status: assignment.status,
    submission: mine
      ? {
          id: mine.id,
          text: mine.text,
          wordCount: mine.wordCount,
          status: mine.status,
          score: mine.score,
          feedback: mine.feedback,
          submittedAt: mine.submittedAt,
          gradedAt: mine.gradedAt,
        }
      : null,
  };
}

export async function submitWriting(userId: string, assignmentId: string, text: string) {
  const assignment = await prisma.writingAssignment.findFirst({ where: { id: assignmentId, status: "PUBLISHED" } });
  if (!assignment) throw ApiError.notFound("Writing assignment not found.");

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < assignment.minWords) {
    throw ApiError.badRequest(`Your essay has ${wordCount} words — minimum is ${assignment.minWords}.`);
  }
  if (wordCount > assignment.maxWords + 50) {
    throw ApiError.badRequest(`Your essay has ${wordCount} words — maximum is ${assignment.maxWords}.`);
  }

  const submission = await prisma.writingSubmission.upsert({
    where: { assignmentId_userId: { assignmentId, userId } },
    create: { assignmentId, userId, text, wordCount, status: "SUBMITTED" },
    update: { text, wordCount, status: "SUBMITTED", submittedAt: new Date() },
  });

  await recordMeaningfulActivity(userId);
  await logActivity(userId, "WRITING_SUBMITTED", { assignmentId, wordCount });
  const teachers = await prisma.user.findMany({ where: { role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  await notify(
    teachers.map((t) => t.id),
    {
      type: "WRITING_SUBMITTED",
      title: `New writing submission`,
      body: `${student?.firstName} ${student?.lastName} — ${assignment.title}`,
      link: `/writing`,
    },
  );

  return submission;
}

export async function createWriting(
  teacherId: string,
  data: { title: string; instructions: string; minWords?: number; maxWords?: number; level: Level; topic?: string; dueAt?: string | null; status: "DRAFT" | "PUBLISHED" },
) {
  const created = await prisma.writingAssignment.create({
    data: {
      title: data.title,
      instructions: data.instructions,
      minWords: data.minWords ?? 100,
      maxWords: data.maxWords ?? 400,
      level: data.level,
      topic: data.topic,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      status: data.status,
      createdById: teacherId,
    },
  });
  if (data.status === "PUBLISHED") {
    await notify(await allStudentIds(), {
      type: "WRITING_ASSIGNED",
      title: `New writing task: ${data.title}`,
      body: data.topic ?? undefined,
      link: "/writing",
    });
  }
  return created;
}

export async function updateWriting(id: string, data: { title?: string; instructions?: string; minWords?: number; maxWords?: number; level?: Level; topic?: string | null; dueAt?: string | null; status?: "DRAFT" | "PUBLISHED" }) {
  const existing = await prisma.writingAssignment.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Writing assignment not found.");
  return prisma.writingAssignment.update({
    where: { id },
    data: { ...data, dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null },
  });
}

export async function deleteWriting(id: string) {
  const existing = await prisma.writingAssignment.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Writing assignment not found.");
  await prisma.writingAssignment.delete({ where: { id } });
  return { id };
}

export async function listSubmissions(assignmentId: string) {
  const assignment = await prisma.writingAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw ApiError.notFound("Writing assignment not found.");
  const rows = await prisma.writingSubmission.findMany({
    where: { assignmentId },
    orderBy: { submittedAt: "desc" },
    include: { user: { select: { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    user: s.user,
    text: s.text,
    wordCount: s.wordCount,
    status: s.status,
    score: s.score,
    feedback: s.feedback,
    submittedAt: s.submittedAt,
    gradedAt: s.gradedAt,
  }));
}

export async function gradeSubmission(teacherId: string, submissionId: string, score: number, feedback: string) {
  const existing = await prisma.writingSubmission.findUnique({ where: { id: submissionId } });
  if (!existing) throw ApiError.notFound("Submission not found.");

  const updated = await prisma.writingSubmission.update({
    where: { id: submissionId },
    data: { score, feedback, status: "GRADED", gradedById: teacherId, gradedAt: new Date() },
  });

  const assignment = await prisma.writingAssignment.findUnique({ where: { id: existing.assignmentId } });
  await notify([existing.userId], {
    type: "WRITING_GRADED",
    title: `Writing graded: ${assignment?.title ?? "assignment"}`,
    body: `Score: ${score}/100`,
    link: "/writing",
  });
  return updated;
}
