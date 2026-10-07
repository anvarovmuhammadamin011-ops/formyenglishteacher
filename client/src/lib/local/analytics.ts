import type { Db, Skill, StudentDashboard, StudentDetailReport, TeacherDashboard } from "@/lib/types";
import { type Ctx, type Handler, notFound, todayKey } from "@/lib/local/core";

const SKILLS: Skill[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"];

function isFinished(status: string): boolean {
  return status === "SUBMITTED" || status === "TIME_UP";
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(todayKey(daysAgo(i)));
  return out;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOf(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function bucketize(days: string[]): Map<string, { attempts: number; scoreSum: number }> {
  return new Map(days.map((d) => [d, { attempts: 0, scoreSum: 0 }]));
}

function bucketChart(
  days: string[],
  buckets: Map<string, { attempts: number; scoreSum: number }>,
): Array<{ date: string; attempts: number; averageScore: number }> {
  return days.map((date) => {
    const bucket = buckets.get(date)!;
    return {
      date,
      attempts: bucket.attempts,
      averageScore: bucket.attempts ? round1(bucket.scoreSum / bucket.attempts) : 0,
    };
  });
}

function teacherDashboard(db: Db): TeacherDashboard {
  const now = new Date().toISOString();
  const since30 = daysAgo(30).toISOString();
  const since90 = daysAgo(90).toISOString();
  const testsById = new Map(db.tests.map((t) => [t.id, t]));

  const students = db.users.filter(
    (u) => u.role === "STUDENT" && u.status === "ACTIVE" && !u.deletedAt,
  ).length;
  const groups = db.groups.filter((g) => g.status === "ACTIVE").length;
  const tests = db.tests.filter((t) => t.status === "PUBLISHED" && !t.deletedAt).length;

  const finished30 = db.attempts.filter(
    (a) => isFinished(a.status) && (a.submittedAt ?? "") >= since30,
  );

  const days = lastDays(30);
  const buckets = bucketize(days);
  for (const a of finished30) {
    if (!a.submittedAt) continue;
    const bucket = buckets.get(todayKey(new Date(a.submittedAt)));
    if (bucket) {
      bucket.attempts += 1;
      bucket.scoreSum += a.percentage;
    }
  }

  const skillTotals = new Map<Skill, { sum: number; count: number }>(
    SKILLS.map((s) => [s, { sum: 0, count: 0 }]),
  );
  for (const a of db.attempts) {
    if (!isFinished(a.status) || (a.submittedAt ?? "") < since90) continue;
    const test = testsById.get(a.testId);
    if (!test) continue;
    const total = skillTotals.get(test.skill);
    if (total) {
      total.sum += a.percentage;
      total.count += 1;
    }
  }

  const groupSizes = new Map<string, number>();
  for (const g of db.groups) {
    if (g.status !== "ACTIVE") continue;
    groupSizes.set(g.id, db.groupMembers.filter((m) => m.groupId === g.id).length);
  }

  const upcomingDeadlines: TeacherDashboard["upcomingDeadlines"] = [];
  const upcoming = [...db.assignments]
    .filter((a) => a.status === "ACTIVE" && a.deadlineAt >= now)
    .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt))
    .slice(0, 8);
  for (const a of upcoming) {
    const test = testsById.get(a.testId);
    const group = db.groups.find((g) => g.id === a.groupId);
    if (!test || !group) continue;
    upcomingDeadlines.push({
      id: a.id,
      testId: test.id,
      title: test.title,
      skill: test.skill,
      group: group.name,
      groupId: group.id,
      deadlineAt: a.deadlineAt,
      students: groupSizes.get(a.groupId) ?? 0,
      completed: db.attempts.filter((at) => at.assignmentId === a.id && isFinished(at.status))
        .length,
    });
  }

  const userIds = new Set(db.users.map((u) => u.id));
  const recentActivity: TeacherDashboard["recentActivity"] = [];
  const logs = [...db.activityLogs]
    .filter((l) => userIds.has(l.userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  for (const log of logs) {
    const user = db.users.find((u) => u.id === log.userId)!;
    recentActivity.push({
      id: log.id,
      type: log.type,
      meta: log.meta,
      createdAt: log.createdAt,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  }

  return {
    summary: {
      students,
      groups,
      tests,
      attempts30d: finished30.length,
      averageScore30d: round1(averageOf(finished30.map((a) => a.percentage))),
    },
    chart: bucketChart(days, buckets),
    skillBreakdown: SKILLS.map((skill) => {
      const total = skillTotals.get(skill)!;
      return {
        skill,
        averageScore: total.count ? round1(total.sum / total.count) : 0,
        attempts: total.count,
      };
    }),
    upcomingDeadlines,
    recentActivity,
  };
}

function studentDashboard(db: Db, userId: string): StudentDashboard {
  const now = new Date().toISOString();
  const since30 = daysAgo(30).toISOString();
  const testsById = new Map(db.tests.map((t) => [t.id, t]));

  const streak = db.streaks.find((s) => s.userId === userId);
  const progress = db.progress.filter((p) => p.userId === userId);
  const userAttempts = db.attempts.filter((a) => a.userId === userId);
  const finished = userAttempts.filter((a) => isFinished(a.status));
  const inProgress = userAttempts.filter((a) => a.status === "IN_PROGRESS");

  const activeStudents = db.users.filter(
    (u) => u.role === "STUDENT" && u.status === "ACTIVE" && !u.deletedAt,
  );
  const activeIds = new Set(activeStudents.map((s) => s.id));
  const totalsByStudent = new Map<string, { sum: number; count: number }>();
  for (const a of db.attempts) {
    if (!isFinished(a.status) || !activeIds.has(a.userId)) continue;
    const total = totalsByStudent.get(a.userId) ?? { sum: 0, count: 0 };
    total.sum += a.percentage;
    total.count += 1;
    totalsByStudent.set(a.userId, total);
  }
  const ranked = activeStudents
    .map((s) => {
      const total = totalsByStudent.get(s.id);
      return {
        id: s.id,
        average: total ? total.sum / total.count : -1,
        count: total?.count ?? 0,
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.average - a.average || b.count - a.count);
  const rankIndex = ranked.findIndex((s) => s.id === userId);

  const activeDays = new Set<string>();
  for (const l of db.activityLogs) {
    if (l.userId === userId && l.createdAt >= since30) activeDays.add(todayKey(new Date(l.createdAt)));
  }
  for (const a of userAttempts) {
    if (a.createdAt >= since30) activeDays.add(todayKey(new Date(a.createdAt)));
  }
  const calendarDays = lastDays(30);

  const skillProgress = SKILLS.map((skill) => {
    const row = progress.find((p) => p.skill === skill);
    return {
      skill,
      completed: row?.completedCount ?? 0,
      accuracy:
        row && row.totalAnswers
          ? Math.round((row.correctAnswers / row.totalAnswers) * 100)
          : 0,
      averageScore: round1(row?.averagePercentage ?? 0),
      lastActivityAt: row?.lastActivityAt ?? null,
    };
  });

  const inProgressTests = inProgress
    .filter((a) => testsById.has(a.testId))
    .map((a) => {
      const test = testsById.get(a.testId)!;
      return {
        id: a.id,
        assignmentId: a.assignmentId,
        title: test.title,
        skill: test.skill,
        startedAt: a.startedAt,
        expiresAt: a.expiresAt,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const groupIds = new Set(
    db.groupMembers.filter((m) => m.studentId === userId).map((m) => m.groupId),
  );
  const upcoming: StudentDashboard["upcoming"] = [];
  const assignments = [...db.assignments]
    .filter((a) => a.status === "ACTIVE" && a.deadlineAt >= now && groupIds.has(a.groupId))
    .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt))
    .slice(0, 6);
  for (const a of assignments) {
    const test = testsById.get(a.testId);
    const group = db.groups.find((g) => g.id === a.groupId);
    if (!test || !group) continue;
    const mine = finished
      .filter((x) => x.assignmentId === a.id)
      .sort((x, y) => y.percentage - x.percentage);
    upcoming.push({
      assignmentId: a.id,
      testId: test.id,
      title: test.title,
      skill: test.skill,
      difficulty: test.difficulty,
      group: group.name,
      deadlineAt: a.deadlineAt,
      timeLimitSeconds: test.timeLimitSeconds,
      finished: mine.length > 0,
      bestScore: mine.length ? mine[0].percentage : null,
      attemptsUsed: mine.length,
      maxAttempts: a.maxAttempts,
    });
  }

  const finishedByDate = [...finished].sort((a, b) =>
    (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""),
  );
  const recentAttempts = finishedByDate
    .filter((a) => testsById.has(a.testId))
    .slice(0, 6)
    .map((a) => {
      const test = testsById.get(a.testId)!;
    const answers = db.answers.filter((x) => x.attemptId === a.id);
    return {
      id: a.id,
      percentage: a.percentage,
      submittedAt: a.submittedAt,
      correct: answers.filter((x) => x.isCorrect === true).length,
      total: answers.length,
      test: {
        id: test.id,
        title: test.title,
        skill: test.skill,
        difficulty: test.difficulty,
      },
    };
  });

  return {
    streak: {
      current: streak?.currentStreak ?? 0,
      longest: streak?.longestStreak ?? 0,
      lastActivityOn: streak?.lastActivityOn ?? null,
    },
    summary: {
      testsCompleted: finished.length,
      averageScore: round1(averageOf(finished.map((a) => a.percentage))),
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      totalStudents: ranked.length,
      totalSeconds: finished.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0),
      inProgress: inProgress.length,
    },
    skillProgress,
    inProgressTests,
    upcoming,
    recentAttempts,
    calendar: calendarDays.map((date) => ({ date, active: activeDays.has(date) })),
  };
}

function studentDetail(db: Db, id: string): StudentDetailReport {
  const user = db.users.find((u) => u.id === id && u.role === "STUDENT" && !u.deletedAt);
  if (!user) notFound("Student not found.");

  const testsById = new Map(db.tests.map((t) => [t.id, t]));
  const progress = db.progress.filter((p) => p.userId === id);
  const finished = db.attempts
    .filter((a) => a.userId === id && isFinished(a.status))
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  const recent = db.attempts
    .filter((a) => a.userId === id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8);

  const scores = finished.map((a) => a.percentage);

  const skillChart = SKILLS.map((skill) => {
    const rows = finished.filter((a) => testsById.get(a.testId)?.skill === skill);
    const row = progress.find((p) => p.skill === skill);
    return {
      skill,
      attempts: rows.length,
      averageScore: rows.length ? round1(averageOf(rows.map((a) => a.percentage))) : 0,
      accuracy:
        row && row.totalAnswers
          ? Math.round((row.correctAnswers / row.totalAnswers) * 100)
          : 0,
      completed: row?.completedCount ?? 0,
    };
  });

  const days = lastDays(30);
  const buckets = bucketize(days);
  for (const a of finished) {
    if (!a.submittedAt) continue;
    const bucket = buckets.get(todayKey(new Date(a.submittedAt)));
    if (bucket) {
      bucket.attempts += 1;
      bucket.scoreSum += a.percentage;
    }
  }

  const groups = db.groupMembers
    .filter((m) => m.studentId === id)
    .map((m) => db.groups.find((g) => g.id === m.groupId))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .map((g) => ({ id: g.id, name: g.name, level: g.level }));
  const streak = db.streaks.find((s) => s.userId === id);

  return {
    student: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      age: user.age,
      phone: user.phone,
      status: user.status,
      level: user.studentProfile?.level ?? null,
      bio: user.studentProfile?.bio ?? null,
      joinedAt: user.studentProfile?.joinedAt ?? user.createdAt,
      lastLoginAt: user.lastLoginAt,
      groups,
      streak: streak
        ? {
            currentStreak: streak.currentStreak,
            longestStreak: streak.longestStreak,
            lastActivityOn: streak.lastActivityOn,
          }
        : { currentStreak: 0, longestStreak: 0, lastActivityOn: null },
    },
    summary: {
      testsCompleted: finished.length,
      averageScore: round1(averageOf(scores)),
      totalSeconds: finished.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0),
      bestScore: finished.length ? Math.max(...scores) : 0,
    },
    skillChart,
    dailyChart: bucketChart(days, buckets),
    recentAttempts: recent
      .filter((a) => testsById.has(a.testId))
      .map((a) => {
        const test = testsById.get(a.testId)!;
        const assignment = a.assignmentId
          ? db.assignments.find((x) => x.id === a.assignmentId)
          : undefined;
        const group = assignment ? db.groups.find((g) => g.id === assignment.groupId) : undefined;
        return {
          id: a.id,
          status: a.status,
          percentage: a.percentage,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          test: {
            id: test.id,
            title: test.title,
            topic: test.topic,
            skill: test.skill,
            difficulty: test.difficulty,
          },
          group: group?.name ?? null,
        };
      }),
  };
}

export const analyticsRoutes: Record<string, Handler> = {
  "GET /analytics/dashboard": (ctx: Ctx) => {
    ctx.requireTeacher();
    return teacherDashboard(ctx.db);
  },

  "GET /analytics/me": (ctx: Ctx) => {
    const user = ctx.requireStudent();
    return studentDashboard(ctx.db, user.id);
  },

  "GET /analytics/students/:id": (ctx: Ctx) => {
    ctx.requireTeacher();
    return studentDetail(ctx.db, ctx.params.id);
  },
};
