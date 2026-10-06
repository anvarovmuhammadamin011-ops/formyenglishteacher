import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import type { Prisma, Skill } from "@prisma/client";

const SKILLS: Skill[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"];
const FINISHED = ["SUBMITTED", "TIME_UP"] as const;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Last n days as "YYYY-MM-DD" strings, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(daysAgo(i)));
  return out;
}

export type Period = "all" | "7d" | "30d" | "90d";

function periodStart(period?: Period): Date | undefined {
  switch (period) {
    case "7d":
      return daysAgo(7);
    case "30d":
      return daysAgo(30);
    case "90d":
      return daysAgo(90);
    default:
      return undefined;
  }
}

// ───────────────────────── Teacher dashboard ─────────────────────────

export async function teacherDashboard() {
  const since30 = daysAgo(30);
  const since14 = daysAgo(14);

  const [students, groups, tests, attemptsAgg, recentAttempts, upcoming, activities] =
    await Promise.all([
      prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE", deletedAt: null } }),
      prisma.group.count({ where: { status: "ACTIVE" } }),
      prisma.test.count({ where: { status: "PUBLISHED", deletedAt: null } }),
      prisma.testAttempt.aggregate({
        where: { status: { in: [...FINISHED] }, submittedAt: { gte: since30 } },
        _count: { _all: true },
        _avg: { percentage: true },
      }),
      prisma.testAttempt.findMany({
        where: { status: { in: [...FINISHED] }, submittedAt: { gte: since14 } },
        select: { submittedAt: true, percentage: true },
        orderBy: { submittedAt: "desc" },
        take: 5000,
      }),
      prisma.testAssignment.findMany({
        where: { status: "ACTIVE", deadlineAt: { gte: new Date() } },
        orderBy: { deadlineAt: "asc" },
        take: 8,
        include: {
          test: { select: { id: true, title: true, skill: true } },
          group: { select: { id: true, name: true } },
          _count: { select: { attempts: { where: { status: { in: [...FINISHED] } } } } },
        },
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          user: { select: { firstName: true, lastName: true, role: true, avatarUrl: true } },
        },
      }),
    ]);

  const groupSizes = await prisma.groupMember.groupBy({
    by: ["groupId"],
    _count: true,
    where: { group: { status: "ACTIVE" } },
  });
  const sizeByGroup = new Map(groupSizes.map((g) => [g.groupId, g._count]));

  // Daily chart for the last 14 days.
  const days = lastDays(14);
  const byDay = new Map(days.map((d) => [d, { date: d, attempts: 0, scoreSum: 0 }]));
  for (const a of recentAttempts) {
    if (!a.submittedAt) continue;
    const key = isoDay(a.submittedAt);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.attempts += 1;
      bucket.scoreSum += a.percentage;
    }
  }
  const chart = days.map((d) => {
    const b = byDay.get(d)!;
    return {
      date: d,
      attempts: b.attempts,
      averageScore: b.attempts ? Math.round((b.scoreSum / b.attempts) * 10) / 10 : 0,
    };
  });

  // Skill breakdown over the last 90 days.
  const skillRows = await prisma.testAttempt.findMany({
    where: { status: { in: [...FINISHED] }, submittedAt: { gte: daysAgo(90) } },
    select: { percentage: true, test: { select: { skill: true } } },
  });
  const skillMap = new Map<Skill, { sum: number; count: number }>(
    SKILLS.map((s) => [s, { sum: 0, count: 0 }]),
  );
  for (const row of skillRows) {
    const b = skillMap.get(row.test.skill);
    if (b) {
      b.sum += row.percentage;
      b.count += 1;
    }
  }
  const skillBreakdown = SKILLS.map((skill) => {
    const b = skillMap.get(skill)!;
    return { skill, averageScore: b.count ? Math.round((b.sum / b.count) * 10) / 10 : 0, attempts: b.count };
  });

  // Upcoming deadlines with completion counts.
  const deadlineEvents = upcoming.map((a) => ({
    id: a.id,
    testId: a.test.id,
    title: a.test.title,
    skill: a.test.skill,
    group: a.group.name,
    groupId: a.group.id,
    deadlineAt: a.deadlineAt,
    students: sizeByGroup.get(a.group.id) ?? 0,
    completed: a._count.attempts,
  }));

  return {
    summary: {
      students,
      groups,
      tests,
      attempts30d: attemptsAgg._count._all,
      averageScore30d: Math.round((attemptsAgg._avg.percentage ?? 0) * 10) / 10,
    },
    chart,
    skillBreakdown,
    upcomingDeadlines: deadlineEvents,
    recentActivity: activities.map((a) => ({
      id: a.id,
      type: a.type,
      meta: a.meta,
      createdAt: a.createdAt,
      user: a.user,
    })),
  };
}

// ───────────────────────── Student dashboard ─────────────────────────

export async function studentDashboard(userId: string) {
  const [streak, progress, finished, inProgress, upcoming, recent] = await Promise.all([
    prisma.learningStreak.findUnique({ where: { userId } }),
    prisma.studentProgress.findMany({ where: { userId } }),
    prisma.testAttempt.findMany({
      where: { userId, status: { in: [...FINISHED] } },
      select: {
        id: true,
        percentage: true,
        durationSeconds: true,
        submittedAt: true,
        test: { select: { id: true, title: true, skill: true, difficulty: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 500,
    }),
    prisma.testAttempt.findMany({
      where: { userId, status: "IN_PROGRESS" },
      select: {
        id: true,
        startedAt: true,
        expiresAt: true,
        test: { select: { id: true, title: true, skill: true } },
        assignmentId: true,
      },
    }),
    prisma.testAssignment.findMany({
      where: {
        status: "ACTIVE",
        deadlineAt: { gte: new Date() },
        group: { members: { some: { studentId: userId } } },
      },
      orderBy: { deadlineAt: "asc" },
      take: 6,
      include: {
        test: { select: { id: true, title: true, skill: true, difficulty: true, timeLimitSeconds: true } },
        group: { select: { id: true, name: true } },
        attempts: {
          where: { userId, status: { in: [...FINISHED] } },
          select: { id: true, percentage: true },
        },
      },
    }),
    prisma.testAttempt.findMany({
      where: { userId, status: { in: [...FINISHED] } },
      orderBy: { submittedAt: "desc" },
      take: 6,
      include: {
        test: { select: { id: true, title: true, skill: true, difficulty: true } },
        answers: { select: { isCorrect: true } },
      },
    }),
  ]);

  const totalSeconds = finished.reduce((s, a) => s + (a.durationSeconds ?? 0), 0);
  const avg = finished.length
    ? finished.reduce((s, a) => s + a.percentage, 0) / finished.length
    : 0;

  // Rank: position among all students by average score (min 1 finished attempt).
  const allStudents = await prisma.user.findMany({
    where: { role: "STUDENT", status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      _count: { select: { attempts: { where: { status: { in: [...FINISHED] } } } } },
    },
  });
  const withAvg = await prisma.testAttempt.groupBy({
    by: ["userId"],
    where: { userId: { in: allStudents.map((s) => s.id) }, status: { in: [...FINISHED] } },
    _avg: { percentage: true },
    _count: { _all: true },
  });
  const avgByUser = new Map(withAvg.map((r) => [r.userId, r._avg.percentage ?? 0]));
  const ranked = allStudents
    .map((s) => ({ id: s.id, avg: avgByUser.get(s.id) ?? -1, count: s._count.attempts }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
  const rank = ranked.findIndex((s) => s.id === userId);

  // Activity over the last 30 days (attempts + meaningful activity logs).
  const [activityLogs, dayAttempts] = await Promise.all([
    prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: daysAgo(30) } },
      select: { createdAt: true },
    }),
    prisma.testAttempt.findMany({
      where: { userId, createdAt: { gte: daysAgo(30) } },
      select: { createdAt: true },
    }),
  ]);
  const activeDays = new Set<string>();
  for (const l of activityLogs) activeDays.add(isoDay(l.createdAt));
  for (const a of dayAttempts) activeDays.add(isoDay(a.createdAt));
  const calendar = lastDays(30).map((d) => ({ date: d, active: activeDays.has(d) }));

  const skillProgress = SKILLS.map((skill) => {
    const row = progress.find((p) => p.skill === skill);
    return {
      skill,
      completed: row?.completedCount ?? 0,
      accuracy: row && row.totalAnswers ? Math.round((row.correctAnswers / row.totalAnswers) * 100) : 0,
      averageScore: Math.round((row?.averagePercentage ?? 0) * 10) / 10,
      lastActivityAt: row?.lastActivityAt ?? null,
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
      averageScore: Math.round(avg * 10) / 10,
      rank: rank >= 0 ? rank + 1 : null,
      totalStudents: ranked.length,
      totalSeconds,
      inProgress: inProgress.length,
    },
    skillProgress,
    inProgressTests: inProgress.map((a) => ({
      id: a.id,
      assignmentId: a.assignmentId,
      title: a.test.title,
      skill: a.test.skill,
      startedAt: a.startedAt,
      expiresAt: a.expiresAt,
    })),
    upcoming: upcoming.map((a) => ({
      assignmentId: a.id,
      testId: a.test.id,
      title: a.test.title,
      skill: a.test.skill,
      difficulty: a.test.difficulty,
      group: a.group.name,
      deadlineAt: a.deadlineAt,
      timeLimitSeconds: a.test.timeLimitSeconds,
      finished: a.attempts.length > 0,
      bestScore: a.attempts[0]?.percentage ?? null,
    })),
    recentAttempts: recent.map((a) => ({
      id: a.id,
      percentage: a.percentage,
      submittedAt: a.submittedAt,
      correct: a.answers.filter((x) => x.isCorrect === true).length,
      total: a.answers.length,
      test: a.test,
    })),
    calendar,
  };
}

// ───────────────────────── Rankings ─────────────────────────

export async function rankings(opts: { groupId?: string; period?: Period; limit?: number }) {
  const start = periodStart(opts.period);
  const groupFilter = opts.groupId
    ? { group: { members: { some: { groupId: opts.groupId } } } }
    : {};

  const rows = await prisma.testAttempt.findMany({
    where: {
      status: { in: [...FINISHED] },
      ...(start ? { submittedAt: { gte: start } } : {}),
      user: { role: "STUDENT", status: "ACTIVE", deletedAt: null, ...groupFilter },
    },
    select: {
      userId: true,
      percentage: true,
      submittedAt: true,
      user: { select: { firstName: true, lastName: true, username: true, avatarUrl: true } },
    },
  });

  const byUser = new Map<
    string,
    { name: string; username: string; avatarUrl: string | null; sum: number; count: number }
  >();
  for (const r of rows) {
    let b = byUser.get(r.userId);
    if (!b) {
      b = {
        name: `${r.user.firstName} ${r.user.lastName}`.trim(),
        username: r.user.username,
        avatarUrl: r.user.avatarUrl,
        sum: 0,
        count: 0,
      };
      byUser.set(r.userId, b);
    }
    b.sum += r.percentage;
    b.count += 1;
  }

  const streaks = await prisma.learningStreak.findMany({
    where: { userId: { in: [...byUser.keys()] } },
    select: { userId: true, currentStreak: true, longestStreak: true },
  });
  const streakByUser = new Map(streaks.map((s) => [s.userId, s]));

  const ranked = [...byUser.entries()]
    .map(([userId, b]) => ({
      userId,
      name: b.name,
      username: b.username,
      avatarUrl: b.avatarUrl,
      tests: b.count,
      averageScore: Math.round((b.sum / b.count) * 10) / 10,
      streak: streakByUser.get(userId)?.currentStreak ?? 0,
      longestStreak: streakByUser.get(userId)?.longestStreak ?? 0,
    }))
    .sort((a, b) => b.averageScore - a.averageScore || b.tests - a.tests || b.streak - a.streak)
    .slice(0, Math.min(opts.limit ?? 50, 200))
    .map((row, i) => ({ rank: i + 1, ...row }));

  return ranked;
}

// ───────────────────────── Teacher: one student ─────────────────────────

export async function studentDetail(studentId: string) {
  const user = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      avatarUrl: true,
      age: true,
      phone: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      studentProfile: { select: { level: true, bio: true, joinedAt: true } },
      groupMemberships: {
        select: { group: { select: { id: true, name: true, level: true } } },
      },
      streak: { select: { currentStreak: true, longestStreak: true, lastActivityOn: true } },
    },
  });
  if (!user) throw ApiError.notFound("Student not found.");

  const [progress, attempts, recent] = await Promise.all([
    prisma.studentProgress.findMany({ where: { userId: studentId } }),
    prisma.testAttempt.findMany({
      where: { userId: studentId, status: { in: [...FINISHED] } },
      select: {
        percentage: true,
        durationSeconds: true,
        submittedAt: true,
        test: { select: { skill: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.testAttempt.findMany({
      where: { userId: studentId },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: {
        test: { select: { id: true, title: true, skill: true, difficulty: true } },
        assignment: { select: { group: { select: { name: true } } } },
      },
    }),
  ]);

  const avg = attempts.length ? attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length : 0;

  const skillChart = SKILLS.map((skill) => {
    const rows = attempts.filter((a) => a.test.skill === skill);
    const p = progress.find((x) => x.skill === skill);
    return {
      skill,
      attempts: rows.length,
      averageScore: rows.length
        ? Math.round((rows.reduce((s, a) => s + a.percentage, 0) / rows.length) * 10) / 10
        : 0,
      accuracy: p && p.totalAnswers ? Math.round((p.correctAnswers / p.totalAnswers) * 100) : 0,
      completed: p?.completedCount ?? 0,
    };
  });

  const days = lastDays(30);
  const perDay = new Map(days.map((d) => [d, { date: d, attempts: 0, scoreSum: 0 }]));
  for (const a of attempts) {
    if (!a.submittedAt) continue;
    const b = perDay.get(isoDay(a.submittedAt));
    if (b) {
      b.attempts += 1;
      b.scoreSum += a.percentage;
    }
  }

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
      groups: user.groupMemberships.map((g) => g.group),
      streak: user.streak ?? { currentStreak: 0, longestStreak: 0, lastActivityOn: null },
    },
    summary: {
      testsCompleted: attempts.length,
      averageScore: Math.round(avg * 10) / 10,
      totalSeconds: attempts.reduce((s, a) => s + (a.durationSeconds ?? 0), 0),
      bestScore: attempts.length ? Math.max(...attempts.map((a) => a.percentage)) : 0,
    },
    skillChart,
    dailyChart: days.map((d) => {
      const b = perDay.get(d)!;
      return {
        date: d,
        attempts: b.attempts,
        averageScore: b.attempts ? Math.round((b.scoreSum / b.attempts) * 10) / 10 : 0,
      };
    }),
    recentAttempts: recent.map((a) => ({
      id: a.id,
      status: a.status,
      percentage: a.percentage,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      test: a.test,
      group: a.assignment?.group.name ?? null,
    })),
  };
}

// ───────────────────────── Teacher: one group ─────────────────────────

export async function groupDetail(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              avatarUrl: true,
              status: true,
              streak: { select: { currentStreak: true, longestStreak: true } },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!group) throw ApiError.notFound("Group not found.");

  const studentIds = group.members.map((m) => m.student.id);

  const [attemptRows, assignments, progressRows] = await Promise.all([
    prisma.testAttempt.findMany({
      where: { userId: { in: studentIds }, status: { in: [...FINISHED] } },
      select: {
        userId: true,
        percentage: true,
        test: { select: { skill: true } },
      },
    }),
    prisma.testAssignment.findMany({
      where: { groupId },
      orderBy: { deadlineAt: "desc" },
      take: 30,
      include: {
        test: { select: { id: true, title: true, skill: true } },
        _count: { select: { attempts: { where: { status: { in: [...FINISHED] } } } } },
        attempts: {
          where: { userId: { in: studentIds }, status: { in: [...FINISHED] } },
          select: { percentage: true },
        },
      },
    }),
    prisma.studentProgress.findMany({ where: { userId: { in: studentIds } } }),
  ]);

  const perStudent = new Map<
    string,
    { sum: number; count: number; skillSums: Map<Skill, { sum: number; count: number }> }
  >();
  for (const a of attemptRows) {
    let b = perStudent.get(a.userId);
    if (!b) {
      b = { sum: 0, count: 0, skillSums: new Map() };
      perStudent.set(a.userId, b);
    }
    b.sum += a.percentage;
    b.count += 1;
    let sb = b.skillSums.get(a.test.skill);
    if (!sb) {
      sb = { sum: 0, count: 0 };
      b.skillSums.set(a.test.skill, sb);
    }
    sb.sum += a.percentage;
    sb.count += 1;
  }

  const sizes = new Map<string, number>();
  // Completion is per assignment vs group size.
  for (const a of assignments) sizes.set(a.id, group.members.length);

  const members = group.members.map((m) => {
    const b = perStudent.get(m.student.id);
    const p = progressRows.filter((x) => x.userId === m.student.id);
    return {
      id: m.student.id,
      firstName: m.student.firstName,
      lastName: m.student.lastName,
      username: m.student.username,
      avatarUrl: m.student.avatarUrl,
      status: m.student.status,
      joinedAt: m.joinedAt,
      streak: m.student.streak?.currentStreak ?? 0,
      tests: b?.count ?? 0,
      averageScore: b ? Math.round((b.sum / b.count) * 10) / 10 : null,
      skills: SKILLS.map((skill) => {
        const sb = b?.skillSums.get(skill);
        return {
          skill,
          averageScore: sb ? Math.round((sb.sum / sb.count) * 10) / 10 : null,
          attempts: sb?.count ?? 0,
        };
      }),
      vocabulary: p.find((x) => x.skill === "VOCABULARY")?.completedCount ?? 0,
    };
  });

  const groupSkillAverages = SKILLS.map((skill) => {
    const rows = attemptRows.filter((a) => a.test.skill === skill);
    return {
      skill,
      attempts: rows.length,
      averageScore: rows.length
        ? Math.round((rows.reduce((s, a) => s + a.percentage, 0) / rows.length) * 10) / 10
        : 0,
    };
  });

  return {
    group: {
      id: group.id,
      name: group.name,
      level: group.level,
      description: group.description,
      status: group.status,
      createdAt: group.createdAt,
      studentCount: group.members.length,
    },
    skillAverages: groupSkillAverages,
    members,
    assignments: assignments.map((a) => ({
      id: a.id,
      testId: a.test.id,
      title: a.test.title,
      skill: a.test.skill,
      startAt: a.startAt,
      deadlineAt: a.deadlineAt,
      status: a.status,
      students: sizes.get(a.id) ?? 0,
      completed: a._count.attempts,
      averageScore: a.attempts.length
        ? Math.round((a.attempts.reduce((s, x) => s + x.percentage, 0) / a.attempts.length) * 10) / 10
        : null,
    })),
  };
}

// ───────────────────────── Calendar ─────────────────────────

export async function calendar(user: { id: string; role: "TEACHER" | "STUDENT" }, from: Date, to: Date) {
  if (user.role === "TEACHER") {
    const assignments = await prisma.testAssignment.findMany({
      where: { deadlineAt: { gte: from, lte: to }, status: "ACTIVE" },
      include: {
        test: { select: { id: true, title: true, skill: true } },
        group: { select: { id: true, name: true } },
      },
    });
    return assignments.map((a) => ({
      id: a.id,
      date: isoDay(a.deadlineAt),
      type: "DEADLINE" as const,
      title: `${a.test.title} — due`,
      detail: a.group.name,
      link: `/tests/${a.test.id}`,
      startAt: a.startAt,
      deadlineAt: a.deadlineAt,
      skill: a.test.skill,
    }));
  }

  const assignments = await prisma.testAssignment.findMany({
    where: {
      deadlineAt: { gte: from, lte: to },
      status: "ACTIVE",
      group: { members: { some: { studentId: user.id } } },
    },
    include: {
      test: { select: { id: true, title: true, skill: true } },
      group: { select: { id: true, name: true } },
      attempts: { where: { userId: user.id, status: { in: [...FINISHED] } }, select: { id: true } },
    },
  });

  type StudentEvent = {
    id: string;
    date: string;
    type: "DEADLINE" | "START";
    title: string;
    detail: string;
    link: string;
    startAt: Date;
    deadlineAt: Date;
    skill: Skill;
    completed: boolean;
  };

  const events: StudentEvent[] = assignments.map((a) => ({
    id: a.id,
    date: isoDay(a.deadlineAt),
    type: "DEADLINE" as const,
    title: `${a.test.title} — due`,
    detail: `${a.group.name} • ${a.attempts.length ? "completed" : "pending"}`,
    link: `/tests`,
    startAt: a.startAt,
    deadlineAt: a.deadlineAt,
    skill: a.test.skill,
    completed: a.attempts.length > 0,
  }));

  // Also mark test start dates so students see the window opening.
  for (const a of assignments) {
    if (a.startAt >= from && a.startAt <= to) {
      events.push({
        id: `${a.id}-start`,
        date: isoDay(a.startAt),
        type: "START",
        title: `${a.test.title} — opens`,
        detail: a.group.name,
        link: `/tests`,
        startAt: a.startAt,
        deadlineAt: a.deadlineAt,
        skill: a.test.skill,
        completed: a.attempts.length > 0,
      });
    }
  }
  return events.sort((x, y) => x.date.localeCompare(y.date));
}
