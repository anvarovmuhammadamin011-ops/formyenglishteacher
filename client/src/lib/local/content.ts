import type { Level, VocabularyStatus, Skill, DbReadingAttempt } from "@/lib/types";
import {
  type Ctx,
  type Handler,
  badRequest,
  notFound,
  okList,
  qInt,
  qStr,
} from "@/lib/local/core";
import { logActivity, mutate, nowIso, uid } from "@/lib/db";

const VOCAB_LEARNED_THRESHOLD = 3;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function getStreakRow(db: any, userId: string) {
  let s = db.streaks.find((r: any) => r.userId === userId);
  if (!s) {
    s = {
      id: uid("stk"),
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityOn: null,
      updatedAt: nowIso(),
    };
    db.streaks.push(s);
  }
  return s;
}

function getProgressRow(db: any, userId: string, skill: Skill) {
  let r = db.progress.find((p: any) => p.userId === userId && p.skill === skill);
  if (!r) {
    r = {
      id: uid("prg"),
      userId,
      skill,
      completedCount: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      totalSeconds: 0,
      averagePercentage: 0,
      lastActivityAt: null,
      updatedAt: nowIso(),
    };
    db.progress.push(r);
  }
  return r;
}

function recordMeaningfulActivity(db: any, userId: string) {
  const s = getStreakRow(db, userId);
  const today = toDateKey(new Date());
  if (s.lastActivityOn === today) {
    s.updatedAt = nowIso();
    return;
  }
  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateKey(d);
  })();
  if (s.lastActivityOn === yesterdayKey) {
    s.currentStreak = (s.currentStreak || 0) + 1;
  } else {
    s.currentStreak = 1;
  }
  if ((s.currentStreak || 0) > (s.longestStreak || 0)) {
    s.longestStreak = s.currentStreak || 0;
  }
  s.lastActivityOn = today;
  s.updatedAt = nowIso();
}

function bumpProgress(
  db: any,
  userId: string,
  skill: Skill,
  opts: {
    completed?: number;
    correct?: number;
    total?: number;
    percentage?: number;
    seconds?: number;
  },
) {
  const row = getProgressRow(db, userId, skill);
  const completedDelta = opts.completed ?? 0;
  const correctDelta = opts.correct ?? 0;
  const totalDelta = opts.total ?? 0;
  const prevCompleted = row.completedCount || 0;
  const nextCompleted = prevCompleted + completedDelta;
  if (nextCompleted <= 0) {
    row.completedCount = 0;
    row.averagePercentage = 0;
  } else {
    const pct = opts.percentage ?? 0;
    const prevAvg = row.averagePercentage || 0;
    row.averagePercentage =
      Math.round(
        ((prevAvg * prevCompleted + pct * completedDelta) / nextCompleted) * 100,
      ) / 100;
  }
  row.completedCount = nextCompleted;
  row.correctAnswers = (row.correctAnswers || 0) + correctDelta;
  row.totalAnswers = (row.totalAnswers || 0) + totalDelta;
  row.totalSeconds = (row.totalSeconds || 0) + (opts.seconds ?? 0);
  row.lastActivityAt = nowIso();
  row.updatedAt = nowIso();
}

function asLevel(v: unknown): Level | undefined {
  const s = String(v || "").toUpperCase() as Level;
  const allowed: Level[] = [
    "BEGINNER",
    "ELEMENTARY",
    "PRE_INTERMEDIATE",
    "INTERMEDIATE",
    "UPPER_INTERMEDIATE",
    "ADVANCED",
  ];
  return allowed.includes(s) ? s : undefined;
}

function asStatus(v: unknown): VocabularyStatus | undefined {
  const s = String(v || "").toUpperCase() as VocabularyStatus;
  return s === "NEW" || s === "LEARNING" || s === "LEARNED" ? s : undefined;
}

export const contentRoutes: Record<string, Handler> = {
  "GET /vocabulary": (ctx: Ctx) => {
    const u = ctx.requireUser();
    const page = qInt(ctx, "page", 1);
    const limit = Math.min(200, Math.max(1, qInt(ctx, "limit", 20)));
    const search = qStr(ctx, "search", "").toLowerCase();
    const level = asLevel(ctx.query.level);
    const category = ctx.query.category ? String(ctx.query.category) : undefined;
    const statusFilter = asStatus(ctx.query.status);

    return mutate((db) => {
      const progressAll = db.vocabularyProgress.filter((p) => p.userId === u.id);
      const progById = new Map(progressAll.map((p) => [p.vocabularyId, p]));

      let items = db.vocabulary
        .filter((v) => {
          if (level && v.level !== level) return false;
          if (category && (v.category || null) !== category) return false;
          if (search) {
            const s = search;
            if (
              !v.word.toLowerCase().includes(s) &&
              !v.uzbek.toLowerCase().includes(s)
            )
              return false;
          }
          return true;
        })
        .map((v) => {
          const p = progById.get(v.id);
          return {
            id: v.id,
            word: v.word,
            uzbek: v.uzbek,
            russian: v.russian ?? null,
            example: v.example ?? null,
            pronunciation: v.pronunciation ?? null,
            category: v.category ?? null,
            level: v.level,
            status: (p?.status ?? "NEW") as VocabularyStatus,
            correctCount: p?.correctCount ?? 0,
            wrongCount: p?.wrongCount ?? 0,
            masteredAt: p?.masteredAt ?? null,
          };
        });

      if (statusFilter) {
        items = items.filter((it) => it.status === statusFilter);
      }

      const sorted = items.sort((a, b) => {
        const ca = a.category || "";
        const cb = b.category || "";
        if (ca !== cb) return ca.localeCompare(cb);
        return a.word.localeCompare(b.word);
      });

      const totalBefore = db.vocabulary.filter((v) => {
        if (level && v.level !== level) return false;
        if (category && (v.category || null) !== category) return false;
        if (search) {
          const s = search;
          if (
            !v.word.toLowerCase().includes(s) &&
            !v.uzbek.toLowerCase().includes(s)
          )
            return false;
        }
        return true;
      }).length;

      const start = (page - 1) * limit;
      const paged = sorted.slice(start, start + limit);
      const total = statusFilter ? sorted.length : totalBefore;

      return okList(paged, total, {
        page,
        limit,
        skip: start,
        take: limit,
      });
    });
  },

  "GET /vocabulary/stats": (ctx: Ctx) => {
    const u = ctx.requireUser();
    return mutate((db) => {
      const total = db.vocabulary.length;
      const prog = db.vocabularyProgress.filter((p) => p.userId === u.id);
      const learned = prog.filter((p) => p.status === "LEARNED").length;
      const learning = prog.filter((p) => p.status === "LEARNING").length;
      const correct = prog.reduce((s, p) => s + (p.correctCount || 0), 0);
      const wrong = prog.reduce((s, p) => s + (p.wrongCount || 0), 0);
      const accuracy = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
      return {
        total,
        learned,
        learning,
        new: Math.max(0, total - learned - learning),
        accuracy,
      };
    });
  },

  "GET /vocabulary/categories": () => {
    return mutate((db) => {
      const map = new Map<string, number>();
      for (const v of db.vocabulary) {
        const c = v.category;
        if (c) {
          map.set(c, (map.get(c) || 0) + 1);
        }
      }
      return Array.from(map.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => a.category.localeCompare(b.category));
    });
  },

  "POST /vocabulary": (ctx: Ctx) => {
    const t = ctx.requireTeacher();
    const b = ctx.body || {};
    const word = String(b.word || "").trim();
    const uzbek = String(b.uzbek || "").trim();
    const russian = b.russian != null ? String(b.russian).trim() : null;
    const example = b.example != null ? String(b.example).trim() : null;
    const pronunciation = b.pronunciation != null ? String(b.pronunciation).trim() : null;
    const category = b.category != null ? String(b.category).trim() : null;
    const level = asLevel(b.level);
    if (!word || !uzbek || !level) badRequest("word, uzbek, level required");

    return mutate((db) => {
      const now = nowIso();
      const id = uid("vocab");
      db.vocabulary.push({
        id,
        word,
        uzbek,
        russian: russian || null,
        example: example || null,
        pronunciation: pronunciation || null,
        category: category || null,
        level,
        createdById: t.id,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id,
        word,
        uzbek,
        russian: russian || null,
        example: example || null,
        pronunciation: pronunciation || null,
        category: category || null,
        level,
        createdById: t.id,
        createdAt: now,
        updatedAt: now,
      };
    });
  },

  "PATCH /vocabulary/:id": (ctx: Ctx) => {
    ctx.requireTeacher();
    const id = ctx.params.id;
    const b = ctx.body || {};
    return mutate((db) => {
      const v = db.vocabulary.find((x) => x.id === id);
      if (!v) notFound("Word not found.");
      if (b.word != null) v.word = String(b.word).trim();
      if (b.uzbek != null) v.uzbek = String(b.uzbek).trim();
      if (b.russian != null) v.russian = String(b.russian).trim() || null;
      if (b.example != null) v.example = String(b.example).trim() || null;
      if (b.pronunciation != null)
        v.pronunciation = String(b.pronunciation).trim() || null;
      if (b.category != null) v.category = String(b.category).trim() || null;
      if (b.level != null) {
        const lvl = asLevel(b.level);
        if (lvl) v.level = lvl;
      }
      v.updatedAt = nowIso();
      return { ...v };
    });
  },

  "DELETE /vocabulary/:id": (ctx: Ctx) => {
    ctx.requireTeacher();
    const id = ctx.params.id;
    return mutate((db) => {
      const idx = db.vocabulary.findIndex((x) => x.id === id);
      if (idx < 0) notFound("Word not found.");
      db.vocabulary.splice(idx, 1);
      db.vocabularyProgress = db.vocabularyProgress.filter((p) => p.vocabularyId !== id);
      return { id };
    });
  },

  "POST /vocabulary/:id/practice": (ctx: Ctx) => {
    const u = ctx.requireUser();
    const id = ctx.params.id;
    const b = ctx.body || {};
    const correct = b.correct === true;
    return mutate((db) => {
      const w = db.vocabulary.find((x) => x.id === id);
      if (!w) notFound("Word not found.");
      let p = db.vocabularyProgress.find(
        (x) => x.userId === u.id && x.vocabularyId === id,
      );
      const now = nowIso();
      if (!p) {
        p = {
          id: uid("vprog"),
          userId: u.id,
          vocabularyId: id,
          status: "NEW" as VocabularyStatus,
          correctCount: 0,
          wrongCount: 0,
          masteredAt: null,
          createdAt: now,
          updatedAt: now,
        };
        db.vocabularyProgress.push(p);
      }
      const newCorrect = (p.correctCount || 0) + (correct ? 1 : 0);
      const newWrong = (p.wrongCount || 0) + (correct ? 0 : 1);
      const totalTries = newCorrect + newWrong;
      let newStatus: VocabularyStatus = p.status || "NEW";
      if (newCorrect >= VOCAB_LEARNED_THRESHOLD) {
        newStatus = "LEARNED";
      } else if (totalTries > 0) {
        newStatus = "LEARNING";
      } else {
        newStatus = "NEW";
      }
      let masteredAt: string | null = p.masteredAt || null;
      if (newStatus === "LEARNED" && !masteredAt) {
        masteredAt = now;
      }
      p.correctCount = newCorrect;
      p.wrongCount = newWrong;
      p.status = newStatus;
      p.masteredAt = masteredAt;
      p.updatedAt = now;

      bumpProgress(db, u.id, "VOCABULARY", {
        correct: correct ? 1 : 0,
        total: 1,
        seconds: 5,
      });
      recordMeaningfulActivity(db, u.id);
      logActivity(db, u.id, "VOCABULARY_PRACTICE", {
        vocabularyId: id,
        correct,
        status: newStatus,
      } as any);

      return {
        status: p.status,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        masteredAt: p.masteredAt,
      };
    });
  },

  "GET /reading": (ctx: Ctx) => {
    const u = ctx.requireUser();
    const isTeacher = u.role === "TEACHER";
    const page = qInt(ctx, "page", 1);
    const limit = Math.min(200, Math.max(1, qInt(ctx, "limit", 20)));
    const search = qStr(ctx, "search", "").toLowerCase();
    const level = asLevel(ctx.query.level);

    return mutate((db) => {
      let itemsBase = db.readings.filter((r) => {
        if (!isTeacher && r.status !== "PUBLISHED") return false;
        if (level && r.level !== level) return false;
        if (search && !r.title.toLowerCase().includes(search)) return false;
        return true;
      });

      const myAttempts = db.readingAttempts.filter((a) => a.userId === u.id);
      const bestByMat = new Map<string, { best: number; count: number }>();
      for (const a of myAttempts) {
        const k = a.materialId;
        const cur = bestByMat.get(k);
        if (cur) {
          cur.count += 1;
          if ((a.percentage || 0) > cur.best) cur.best = a.percentage || 0;
        } else {
          bestByMat.set(k, { best: a.percentage || 0, count: 1 });
        }
      }

      const enriched = itemsBase.map((m) => {
        const mine = bestByMat.get(m.id);
        const qCount = db.readingQuestions.filter((q) => q.materialId === m.id).length;
        return {
          id: m.id,
          title: m.title,
          level: m.level,
          topic: m.topic ?? null,
          status: m.status,
          estimatedMinutes: m.estimatedMinutes,
          questions: qCount,
          attempts: mine?.count ?? 0,
          bestScore: mine?.best ?? null,
          createdAt: m.createdAt,
        };
      });

      const sorted = enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = (page - 1) * limit;
      const paged = sorted.slice(start, start + limit);
      const total = sorted.length;

      return okList(paged, total, { page, limit, skip: start, take: limit });
    });
  },

  "POST /reading": (ctx: Ctx) => {
    const t = ctx.requireTeacher();
    const b = ctx.body || {};
    const title = String(b.title || "").trim();
    const level = asLevel(b.level);
    const topic = b.topic != null ? String(b.topic).trim() : null;
    const estimatedMinutes = b.estimatedMinutes != null ? Number(b.estimatedMinutes) : 5;
    const status = String(b.status || "DRAFT").toUpperCase();
    const text = b.text != null ? String(b.text) : undefined;
    const questions = Array.isArray(b.questions) ? b.questions : [];
    if (!title || !level || !text) badRequest("title, level, text required");
    if (status !== "DRAFT" && status !== "PUBLISHED") badRequest("invalid status");

    return mutate((db) => {
      const now = nowIso();
      const id = uid("read");
      db.readings.push({
        id,
        title,
        level,
        topic: topic || null,
        text,
        estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 5,
        status: status as any,
        createdById: t.id,
        createdAt: now,
        updatedAt: now,
      });
      questions.forEach((q: any, i: number) => {
        const qid = uid("rq");
        const opts = Array.isArray(q.options) ? q.options.map((x: any) => String(x)) : [];
        db.readingQuestions.push({
          id: qid,
          materialId: id,
          text: String(q.text || ""),
          options: opts,
          correctAnswer: String(q.correctAnswer || ""),
          order: i,
          points: q.points != null ? Number(q.points) : 1,
        });
      });
      return {
        id,
        title,
        level,
        topic: topic || null,
        status,
        estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 5,
        createdAt: now,
      };
    });
  },

  "GET /reading/:id": (ctx: Ctx) => {
    const u = ctx.requireUser();
    const id = ctx.params.id;
    const isTeacher = u.role === "TEACHER";
    return mutate((db) => {
      const m = db.readings.find((x) => x.id === id);
      if (!m) notFound("Reading not found.");
      if (!isTeacher && m.status !== "PUBLISHED") notFound("Reading not found.");
      const qs = db.readingQuestions
        .filter((q) => q.materialId === id)
        .sort((a, b) => a.order - b.order);
      const attemptsAll = db.readingAttempts.filter((a) => a.materialId === id);
      const myAttempts = attemptsAll.filter((a) => a.userId === u.id).sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
      const unlocked = isTeacher || myAttempts.some((a) => a.submittedAt);
      const questionsOut = qs.map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options,
        order: q.order,
        points: q.points,
        ...(unlocked ? { correctAnswer: q.correctAnswer } : {}),
      }));
      const attemptsOut = (isTeacher ? attemptsAll : myAttempts).map((a) => ({
        id: a.id,
        submittedAt: a.submittedAt,
        percentage: a.percentage,
        score: a.score,
        totalPoints: a.totalPoints,
        durationSeconds: a.durationSeconds,
      }));
      return {
        id: m.id,
        title: m.title,
        level: m.level,
        topic: m.topic ?? null,
        status: m.status,
        estimatedMinutes: m.estimatedMinutes,
        transcriptUnlocked: unlocked,
        text: m.text,
        audioUrl: undefined,
        transcript: null,
        questions: questionsOut,
        attempts: attemptsOut,
      };
    });
  },

  "PATCH /reading/:id": (ctx: Ctx) => {
    ctx.requireTeacher();
    const id = ctx.params.id;
    const b = ctx.body || {};
    return mutate((db) => {
      const m = db.readings.find((x) => x.id === id);
      if (!m) notFound("Reading not found.");
      if (b.title != null) m.title = String(b.title).trim();
      if (b.level != null) {
        const lvl = asLevel(b.level);
        if (lvl) m.level = lvl;
      }
      if (b.topic != null) m.topic = String(b.topic).trim() || null;
      if (b.estimatedMinutes != null) {
        const v = Number(b.estimatedMinutes);
        if (Number.isFinite(v)) m.estimatedMinutes = v;
      }
      if (b.status != null) {
        const s = String(b.status).toUpperCase();
        if (s === "DRAFT" || s === "PUBLISHED") m.status = s as any;
      }
      if (b.text != null) m.text = String(b.text);
      m.updatedAt = nowIso();
      return { id: m.id };
    });
  },

  "DELETE /reading/:id": (ctx: Ctx) => {
    ctx.requireTeacher();
    const id = ctx.params.id;
    return mutate((db) => {
      const idx = db.readings.findIndex((x) => x.id === id);
      if (idx < 0) notFound("Reading not found.");
      db.readings.splice(idx, 1);
      db.readingQuestions = db.readingQuestions.filter((q) => q.materialId !== id);
      db.readingAttempts = db.readingAttempts.filter((a) => a.materialId !== id);
      return { id };
    });
  },

  "POST /reading/:id/attempts": (ctx: Ctx) => {
    const u = ctx.requireUser();
    const id = ctx.params.id;
    const b = ctx.body || {};
    const answers = Array.isArray(b.answers) ? b.answers : [];
    const durationSeconds = b.durationSeconds != null ? Number(b.durationSeconds) : 0;

    return mutate((db) => {
      const m = db.readings.find((x) => x.id === id);
      if (!m) notFound("Reading not found.");
      const qs = db.readingQuestions
        .filter((q) => q.materialId === id)
        .sort((a, b) => a.order - b.order);
      const byId = new Map(qs.map((q) => [q.id, q]));
      let score = 0;
      let totalPoints = 0;
      const detail: Array<{
        id: string;
        text: string;
        options: string[];
        correctAnswer: string;
        points: number;
      }> = [];
      let correctCount = 0;
      let wrongCount = 0;
      answers.forEach((a: any) => {
        const q = byId.get(String(a.questionId));
        if (!q) return;
        totalPoints += q.points || 0;
        const sel = a.selectedIndex;
        const isCorrect = sel !== undefined && sel !== null && String(sel) === String(q.correctAnswer);
        if (isCorrect) {
          score += q.points || 0;
          correctCount += 1;
        } else {
          wrongCount += 1;
        }
      });
      qs.forEach((q) => {
        if (!answers.some((a: any) => String(a.questionId) === q.id)) {
          totalPoints += q.points || 0;
        }
        detail.push({
          id: q.id,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
        });
      });
      const unanswered = qs.length - answers.filter((a: any) => byId.has(String(a.questionId))).length;
      const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 1000) / 10 : 0;

      const now = nowIso();
      const attemptId = uid("rat");
      const attempt: DbReadingAttempt = {
        id: attemptId,
        userId: u.id,
        materialId: id,
        startedAt: now,
        submittedAt: now,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        score,
        totalPoints,
        percentage,
        answers: answers.map((a: any) => ({
          questionId: String(a.questionId),
          answer: a.selectedIndex,
        })),
      };
      db.readingAttempts.push(attempt);

      bumpProgress(db, u.id, "READING", {
        completed: 1,
        correct: correctCount,
        total: qs.length,
        percentage,
        seconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      });
      recordMeaningfulActivity(db, u.id);
      logActivity(db, u.id, "READING_COMPLETED", {
        materialId: id,
        percentage,
      } as any);

      return {
        attemptId,
        score,
        totalPoints,
        percentage,
        correct: correctCount,
        wrong: wrongCount,
        unanswered,
        detail,
      };
    });
  },

  "GET /reading/:id/attempts": (ctx: Ctx) => {
    ctx.requireTeacher();
    const id = ctx.params.id;
    return mutate((db) => {
      const attempts = db.readingAttempts
        .filter((a) => a.materialId === id)
        .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
        .map((a) => {
          const user = db.users.find((u) => u.id === a.userId);
          return {
            id: a.id,
            user: user
              ? {
                  firstName: user.firstName,
                  lastName: user.lastName,
                  username: user.username,
                }
              : { firstName: "", lastName: "", username: "" },
            percentage: a.percentage,
            score: a.score,
            totalPoints: a.totalPoints,
            durationSeconds: a.durationSeconds,
            submittedAt: a.submittedAt,
          };
        });
      return attempts;
    });
  },
};
