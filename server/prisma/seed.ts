/**
 * ELMS demo seed.
 *
 * Creates a realistic classroom: teacher, groups, students, tests with real
 * questions, assignments across the last month, and genuinely graded attempts
 * so every dashboard, ranking and report has real data behind it.
 *
 * Run: npm run db:seed
 */
import { PrismaClient, type Question, type QuestionOption, type Skill } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEST_BANK } from "./data/bank";
import { LISTENINGS, READINGS, VOCABULARY, WRITINGS } from "./data/content";
import { gradeAttempt } from "../src/lib/grading";

const prisma = new PrismaClient();

const DAY = 86_400_000;
const TEACHER_PASSWORD = "Teacher123!";
const STUDENT_PASSWORD = "student123";

/** Deterministic RNG so reseeding produces stable demo data. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261006);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const intBetween = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function dayAt(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return new Date(d.getTime() - daysAgo * DAY);
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}
function usernameFor(first: string, last: string) {
  return `${first}.${last}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['ʻʼ`]/g, "")
    .replace(/[^a-z0-9.]/g, "");
}

const STUDENTS: Array<{ first: string; last: string; age: number; phone: string; group: string }> = [
  { first: "Muhammad", last: "Anvarov", age: 19, phone: "+998 90 123 45 01", group: "IT 1" },
  { first: "Ali", last: "Karimov", age: 20, phone: "+998 90 123 45 02", group: "IT 1" },
  { first: "Aziz", last: "Rahimov", age: 18, phone: "+998 90 123 45 03", group: "IT 1" },
  { first: "Dilshod", last: "Toshmatov", age: 21, phone: "+998 90 123 45 04", group: "IT 1" },
  { first: "Jasur", last: "Yusupov", age: 19, phone: "+998 90 123 45 05", group: "IT 1" },
  { first: "Sardor", last: "Qodirov", age: 20, phone: "+998 90 123 45 06", group: "IT 1" },
  { first: "Otabek", last: "Nazarov", age: 18, phone: "+998 90 123 45 07", group: "IT 1" },
  { first: "Bekzod", last: "Sobirov", age: 22, phone: "+998 90 123 45 08", group: "IT 1" },
  { first: "Islom", last: "Ismoilov", age: 19, phone: "+998 90 123 45 09", group: "IT 2" },
  { first: "Kamola", last: "Ergasheva", age: 20, phone: "+998 90 123 45 10", group: "IT 2" },
  { first: "Malika", last: "Abdullayeva", age: 18, phone: "+998 90 123 45 11", group: "IT 2" },
  { first: "Nilufar", last: "Tursunova", age: 21, phone: "+998 90 123 45 12", group: "IT 2" },
  { first: "Shahzoda", last: "Komilova", age: 19, phone: "+998 90 123 45 13", group: "IT 2" },
  { first: "Zilola", last: "Mirzayeva", age: 20, phone: "+998 90 123 45 14", group: "IT 2" },
  { first: "Madina", last: "Xolmatova", age: 18, phone: "+998 90 123 45 15", group: "IT 2" },
  { first: "Diyora", last: "Sharipova", age: 19, phone: "+998 90 123 45 16", group: "IT 2" },
  { first: "Gulnoza", last: "Umarova", age: 17, phone: "+998 90 123 45 17", group: "Beginner" },
  { first: "Sevinch", last: "Rahimova", age: 18, phone: "+998 90 123 45 18", group: "Beginner" },
  { first: "Robiya", last: "Yusupova", age: 17, phone: "+998 90 123 45 19", group: "Beginner" },
  { first: "Khatira", last: "Mamatova", age: 19, phone: "+998 90 123 45 20", group: "Beginner" },
  { first: "Ulugbek", last: "Aliyev", age: 18, phone: "+998 90 123 45 21", group: "Beginner" },
  { first: "Doniyor", last: "Sattorov", age: 20, phone: "+998 90 123 45 22", group: "Beginner" },
  { first: "Shahrom", last: "Xolmatov", age: 22, phone: "+998 90 123 45 23", group: "IELTS" },
  { first: "Abdulla", last: "Ergashev", age: 23, phone: "+998 90 123 45 24", group: "IELTS" },
  { first: "Mohinur", last: "Sharipova", age: 21, phone: "+998 90 123 45 25", group: "IELTS" },
  { first: "Farrux", last: "Tursunov", age: 24, phone: "+998 90 123 45 26", group: "IELTS" },
  { first: "Munisa", last: "Ismoilova", age: 22, phone: "+998 90 123 45 27", group: "IELTS" },
];

const GROUPS = [
  { name: "IT 1", level: "BEGINNER" as const, description: "First year IT students — foundations of English." },
  { name: "IT 2", level: "ELEMENTARY" as const, description: "Second year IT students — everyday English." },
  { name: "Beginner", level: "BEGINNER" as const, description: "Absolute beginners, A0 → A1." },
  { name: "IELTS", level: "INTERMEDIATE" as const, description: "IELTS preparation group, target 6.5+." },
];

type Ability = { userId: string; ability: number; group: string };

async function wipe() {
  await prisma.$transaction([
    prisma.answer.deleteMany(),
    prisma.testAttempt.deleteMany(),
    prisma.testAssignment.deleteMany(),
    prisma.questionOption.deleteMany(),
    prisma.question.deleteMany(),
    prisma.test.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.learningStreak.deleteMany(),
    prisma.studentProgress.deleteMany(),
    prisma.vocabularyProgress.deleteMany(),
    prisma.vocabulary.deleteMany(),
    prisma.readingAttempt.deleteMany(),
    prisma.readingQuestion.deleteMany(),
    prisma.readingMaterial.deleteMany(),
    prisma.listeningAttempt.deleteMany(),
    prisma.listeningQuestion.deleteMany(),
    prisma.listeningMaterial.deleteMany(),
    prisma.writingSubmission.deleteMany(),
    prisma.writingAssignment.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.group.deleteMany(),
    prisma.aiUsageLog.deleteMany(),
    prisma.aiRequest.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.teacherProfile.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.FORCE_SEED) {
    console.log("[seed] Refusing to seed in production (set FORCE_SEED=1 to override).");
    return;
  }

  console.log("[seed] Resetting database ...");
  await wipe();

  // ── Teacher ─────────────────────────────────────────────
  const teacher = await prisma.user.create({
    data: {
      role: "TEACHER",
      firstName: "Nodira",
      lastName: "Yusupova",
      username: "teacher",
      passwordHash: await bcrypt.hash(TEACHER_PASSWORD, 10),
      status: "ACTIVE",
      teacherProfile: { create: { subject: "English", bio: "English teacher • 8 years of experience" } },
    },
  });
  console.log(`[seed] Teacher: teacher / ${TEACHER_PASSWORD}`);

  // ── Groups ──────────────────────────────────────────────
  const groupMap = new Map<string, string>();
  for (const g of GROUPS) {
    const group = await prisma.group.create({
      data: { name: g.name, level: g.level, description: g.description, createdById: teacher.id },
    });
    groupMap.set(g.name, group.id);
  }

  // ── Students ────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 10);
  const abilities: Ability[] = [];
  const studentIds: string[] = [];

  for (const s of STUDENTS) {
    const user = await prisma.user.create({
      data: {
        role: "STUDENT",
        firstName: s.first,
        lastName: s.last,
        username: usernameFor(s.first, s.last),
        passwordHash,
        age: s.age,
        phone: s.phone,
        status: "ACTIVE",
        studentProfile: {
          create: {
            level: GROUPS.find((g) => g.name === s.group)!.level,
            joinedAt: dayAt(intBetween(20, 90), 9),
          },
        },
        groupMemberships: { create: { groupId: groupMap.get(s.group)! } },
      },
    });
    studentIds.push(user.id);
    // Spread of abilities; the IELTS group is stronger.
    const base = s.group === "IELTS" ? 0.74 : s.group === "Beginner" ? 0.52 : 0.63;
    abilities.push({ userId: user.id, ability: Math.min(0.97, base + rand() * 0.28), group: s.group });
  }
  console.log(`[seed] ${STUDENTS.length} students created (login password: ${STUDENT_PASSWORD})`);

  // ── Tests ───────────────────────────────────────────────
  const tests: Array<{
    id: string;
    title: string;
    skill: Skill;
    timeLimitSeconds: number;
    passingScore: number;
    questions: (Question & { options: QuestionOption[] })[];
  }> = [];

  for (const bank of TEST_BANK) {
    const test = await prisma.test.create({
      data: {
        title: bank.title,
        description: bank.description,
        topic: bank.topic,
        skill: bank.skill,
        difficulty: bank.difficulty,
        timeLimitSeconds: bank.timeLimitSeconds,
        passingScore: bank.passingScore,
        instructions: bank.instructions ?? null,
        status: "PUBLISHED",
        type: "MANUAL",
        createdById: teacher.id,
        questions: {
          create: bank.questions.map((q, idx) => {
            const isTF = q.type === "TRUE_FALSE";
            const correctIndexes = Array.isArray(q.correct)
              ? q.correct
              : typeof q.correct === "number"
                ? [q.correct]
                : [];
            return {
              type: q.type,
              text: q.text,
              topic: bank.topic,
              order: idx,
              points: 1,
              correctAnswer: q.correctText ?? null,
              explanation: q.explanation ?? null,
              options: {
                create: isTF
                  ? ["True", "False"].map((text, i) => ({ text, isCorrect: i === correctIndexes[0], order: i }))
                  : (q.options ?? []).map((text, i) => ({
                      text,
                      isCorrect: correctIndexes.includes(i),
                      order: i,
                    })),
              },
            };
          }),
        },
      },
      include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
    });
    tests.push(test);
  }
  console.log(`[seed] ${tests.length} tests with real questions`);

  const testByTitle = (title: string) => tests.find((t) => t.title.startsWith(title))!;

  // ── Assignments (past month + today + upcoming) ─────────
  const today = startOfDay(new Date());
  type AssignmentPlan = {
    testTitle: string;
    groups: string[];
    startAt: Date;
    deadlineAt: Date;
    durationSeconds?: number;
    completionRate: number;
  };

  const plans: AssignmentPlan[] = [
    { testTitle: "Present Simple", groups: ["IT 1", "IT 2"], startAt: dayAt(14, 16), deadlineAt: dayAt(13, 23, 59), completionRate: 0.86 },
    { testTitle: "Vocabulary Challenge", groups: ["IT 1", "IT 2", "Beginner", "IELTS"], startAt: dayAt(10, 16), deadlineAt: dayAt(9, 23, 59), completionRate: 0.82 },
    { testTitle: "Past Simple", groups: ["IT 1", "IT 2"], startAt: dayAt(7, 17), deadlineAt: dayAt(6, 23, 59), completionRate: 0.8 },
    { testTitle: "Present Continuous", groups: ["IT 1", "Beginner"], startAt: dayAt(4, 17), deadlineAt: dayAt(3, 23, 59), completionRate: 0.78 },
    { testTitle: "Reading", groups: ["IT 1", "IT 2", "Beginner", "IELTS"], startAt: dayAt(2, 16), deadlineAt: dayAt(1, 23, 59), completionRate: 0.74 },
    // Today — everything the dashboard KPIs depend on:
    { testTitle: "Past Simple", groups: ["IELTS"], startAt: new Date(today.getTime() + 6 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.72 },
    { testTitle: "Present Simple", groups: ["IT 1"], startAt: new Date(today.getTime() + 7 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.55 },
    { testTitle: "Vocabulary Challenge", groups: ["IT 2"], startAt: new Date(today.getTime() + 8 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.5 },
    // Upcoming — for the calendar/schedule:
    { testTitle: "Reading", groups: ["Beginner"], startAt: new Date(today.getTime() + 2 * DAY + 6 * 3600_000), deadlineAt: new Date(today.getTime() + 2 * DAY + 23 * 3600_000 + 59 * 60_000), completionRate: 0 },
    { testTitle: "Present Continuous", groups: ["IELTS"], startAt: new Date(today.getTime() + 3 * DAY + 7 * 3600_000), deadlineAt: new Date(today.getTime() + 3 * DAY + 23 * 3600_000 + 59 * 60_000), completionRate: 0 },
  ];

  const abilityByUser = new Map(abilities.map((a) => [a.userId, a]));
  const progressAgg = new Map<string, { skill: string; completed: number; correct: number; total: number; seconds: number; sum: number }>();
  const activityDays = new Map<string, Set<string>>();
  const addDay = (userId: string, d: Date) => {
    if (!activityDays.has(userId)) activityDays.set(userId, new Set());
    activityDays.get(userId)!.add(startOfDay(d).toISOString());
  };

  let attemptCount = 0;

  for (const plan of plans) {
    const test = testByTitle(plan.testTitle);

    for (const groupName of plan.groups) {
      const assignment = await prisma.testAssignment.upsert({
        where: { testId_groupId: { testId: test.id, groupId: groupMap.get(groupName)! } },
        create: {
          testId: test.id,
          groupId: groupMap.get(groupName)!,
          assignedById: teacher.id,
          startAt: plan.startAt,
          deadlineAt: plan.deadlineAt,
          durationSeconds: test.timeLimitSeconds,
          maxAttempts: 1,
          status: "ACTIVE",
        },
        update: {
          startAt: plan.startAt,
          deadlineAt: plan.deadlineAt,
          durationSeconds: test.timeLimitSeconds,
          assignedById: teacher.id,
          status: "ACTIVE",
        },
      });

      const members = await prisma.groupMember.findMany({
        where: { groupId: assignment.groupId },
        select: { studentId: true },
      });

      for (const member of members) {
        const ability = abilityByUser.get(member.studentId)!.ability;
        if (!chance(plan.completionRate)) continue;

        const now = new Date();
        const windowStart = Math.max(plan.startAt.getTime(), now.getTime() - 6 * 3600_000);
        const latestStart = Math.min(plan.deadlineAt.getTime(), now.getTime() - 60_000) - test.timeLimitSeconds * 1000;
        if (latestStart <= windowStart && plan.deadlineAt > now) continue;

        const startRangeStart = plan.deadlineAt > now ? windowStart : plan.startAt.getTime();
        const startRangeEnd = plan.deadlineAt > now ? latestStart : plan.deadlineAt.getTime() - test.timeLimitSeconds * 1000;
        if (startRangeEnd < startRangeStart) continue;

        const startedAt = new Date(startRangeStart + rand() * (startRangeEnd - startRangeStart));
        const fastFactor = 0.4 + rand() * 0.5;
        const durationSeconds = Math.max(60, Math.round(test.timeLimitSeconds * fastFactor));
        const submittedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        const status = durationSeconds >= test.timeLimitSeconds * 0.97 ? "TIME_UP" : "SUBMITTED";

        // Build the student's answers question by question.
        const answers: Array<{ questionId: string; answerText: string | null; selectedOptionIds: string[] }> = [];
        for (const question of test.questions) {
          if (chance(0.03)) continue; // left unanswered
          const isCorrect = chance(Math.min(0.98, ability + 0.05));
          if (question.type === "FILL_BLANK" || question.type === "SHORT_ANSWER") {
            answers.push({
              questionId: question.id,
              answerText: isCorrect
                ? question.correctAnswer?.split("|")[0] ?? "correct"
                : pick(["I don't know", "maybe", "went to school", "he go"]),
              selectedOptionIds: [],
            });
          } else {
            const correctOptions = question.options.filter((o) => o.isCorrect);
            const wrongOptions = question.options.filter((o) => !o.isCorrect);
            let chosen: QuestionOption[];
            if (question.type === "MULTIPLE_SELECT") {
              chosen = isCorrect ? correctOptions : [pick(wrongOptions)];
            } else {
              chosen = [isCorrect && correctOptions.length ? correctOptions[0] : pick(wrongOptions)].filter(Boolean);
            }
            answers.push({
              questionId: question.id,
              answerText: null,
              selectedOptionIds: chosen.map((o) => o.id),
            });
          }
        }

        const graded = gradeAttempt(test.questions, answers);
        const attempt = await prisma.testAttempt.create({
          data: {
            userId: member.studentId,
            testId: test.id,
            assignmentId: assignment.id,
            startedAt,
            expiresAt: new Date(startedAt.getTime() + test.timeLimitSeconds * 1000),
            submittedAt,
            durationSeconds,
            score: graded.score,
            totalPoints: graded.totalPoints,
            percentage: graded.percentage,
            status,
            tabSwitches: chance(0.3) ? intBetween(1, 4) : chance(0.08) ? 6 : 0,
            refreshCount: chance(0.2) ? 1 : 0,
            answers: {
              create: answers.map((a) => ({
                questionId: a.questionId,
                answerText: a.answerText,
                selectedOptionIds: a.selectedOptionIds,
                isCorrect: graded.details.find((d) => d.questionId === a.questionId)?.isCorrect ?? null,
                answeredAt: startedAt,
              })),
            },
          },
        });
        attemptCount++;

        await prisma.activityLog.createMany({
          data: [
            { userId: member.studentId, type: "TEST_STARTED", meta: { attemptId: attempt.id, testId: test.id }, createdAt: startedAt },
            { userId: member.studentId, type: status === "TIME_UP" ? "AUTO_SUBMITTED" : "TEST_SUBMITTED", meta: { attemptId: attempt.id, percentage: graded.percentage }, createdAt: submittedAt },
          ],
        });

        // Aggregates for StudentProgress + streaks.
        const key = `${member.studentId}:${test.skill}`;
        const agg =
          progressAgg.get(key) ??
          { skill: test.skill, completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
        agg.completed += 1;
        agg.correct += graded.correctCount;
        agg.total += test.questions.length;
        agg.seconds += durationSeconds;
        agg.sum += graded.percentage;
        progressAgg.set(key, agg);
        addDay(member.studentId, startedAt);
        addDay(member.studentId, submittedAt);
      }
    }
  }

  // One in-progress attempt so the dashboard shows live activity.
  const it1 = groupMap.get("IT 1")!;
  const liveTest = testByTitle("Present Simple");
  const liveAssignment = await prisma.testAssignment.findFirst({
    where: { testId: liveTest.id, groupId: it1, deadlineAt: { gte: new Date() } },
  });
  if (liveAssignment) {
    const members = await prisma.groupMember.findMany({ where: { groupId: it1 }, select: { studentId: true } });
    const target = members.find((m) => {
      const a = abilityByUser.get(m.studentId)!;
      return a.ability > 0.7 && a.ability < 0.85;
    });
    if (target) {
      const startedAt = new Date(Date.now() - 6 * 60_000);
      await prisma.testAttempt.create({
        data: {
          userId: target.studentId,
          testId: liveTest.id,
          assignmentId: liveAssignment.id,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + liveTest.timeLimitSeconds * 1000),
          status: "IN_PROGRESS",
        },
      });
      await prisma.activityLog.create({
        data: { userId: target.studentId, type: "TEST_STARTED", meta: { live: true }, createdAt: startedAt },
      });
    }
  }

  console.log(`[seed] ${attemptCount} graded attempts + 1 live attempt`);

  // ── Vocabulary ──────────────────────────────────────────
  const vocabIds: string[] = [];
  for (const v of VOCABULARY) {
    const created = await prisma.vocabulary.create({
      data: { ...v, createdById: teacher.id },
    });
    vocabIds.push(created.id);
  }
  for (const userId of studentIds) {
    for (const id of vocabIds) {
      if (!chance(0.55)) continue;
      const learned = chance(0.6);
      await prisma.vocabularyProgress.create({
        data: {
          userId,
          vocabularyId: id,
          status: learned ? "LEARNED" : "LEARNING",
          correctCount: intBetween(1, 6),
          wrongCount: intBetween(0, 3),
          masteredAt: learned ? dayAt(intBetween(1, 20), 18) : null,
        },
      });
      if (chance(0.35)) addDay(userId, dayAt(intBetween(0, 13), 19));
    }
  }

  // ── Reading ─────────────────────────────────────────────
  for (const r of READINGS) {
    const material = await prisma.readingMaterial.create({
      data: {
        title: r.title,
        level: r.level,
        topic: r.topic,
        text: r.text,
        estimatedMinutes: r.estimatedMinutes,
        createdById: teacher.id,
        questions: {
          create: r.questions.map((q, i) => ({
            text: q.text,
            options: q.options,
            correctAnswer: String(q.correct),
            order: i,
            points: 1,
          })),
        },
      },
      include: { questions: true },
    });

    for (const userId of studentIds) {
      if (!chance(0.6)) continue;
      const startedAt = dayAt(intBetween(1, 13), intBetween(16, 22), intBetween(0, 59));
      const duration = intBetween(120, 600);
      const correctCount = material.questions.filter(() => chance(abilityByUser.get(userId)!.ability)).length;
      const total = material.questions.length;
      const answers = material.questions.map((q, i) => ({
        questionId: q.id,
        answer: i < correctCount ? q.options[Number(q.correctAnswer)] : "0",
        isCorrect: i < correctCount,
      }));
      await prisma.readingAttempt.create({
        data: {
          userId,
          materialId: material.id,
          startedAt,
          submittedAt: new Date(startedAt.getTime() + duration * 1000),
          durationSeconds: duration,
          score: correctCount,
          totalPoints: total,
          percentage: Math.round((correctCount / total) * 1000) / 10,
          answers,
        },
      });
      addDay(userId, startedAt);

      const key = `${userId}:READING`;
      const agg = progressAgg.get(key) ?? { skill: "READING", completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
      agg.completed += 1;
      agg.correct += correctCount;
      agg.total += total;
      agg.seconds += duration;
      agg.sum += Math.round((correctCount / total) * 100);
      progressAgg.set(key, agg);
    }
  }

  // ── Listening ───────────────────────────────────────────
  for (const l of LISTENINGS) {
    const material = await prisma.listeningMaterial.create({
      data: {
        title: l.title,
        level: l.level,
        topic: l.topic,
        audioUrl: `/uploads/${l.audioFile}`,
        transcript: l.transcript,
        estimatedMinutes: l.estimatedMinutes,
        createdById: teacher.id,
        questions: {
          create: l.questions.map((q, i) => ({
            text: q.text,
            options: q.options,
            correctAnswer: String(q.correct),
            order: i,
            points: 1,
          })),
        },
      },
      include: { questions: true },
    });

    for (const userId of studentIds) {
      if (!chance(0.5)) continue;
      const startedAt = dayAt(intBetween(1, 13), intBetween(16, 22), intBetween(0, 59));
      const duration = intBetween(90, 420);
      const correctCount = material.questions.filter(() => chance(abilityByUser.get(userId)!.ability)).length;
      const total = material.questions.length;
      const answers = material.questions.map((q, i) => ({
        questionId: q.id,
        answer: i < correctCount ? q.options[Number(q.correctAnswer)] : "0",
        isCorrect: i < correctCount,
      }));
      await prisma.listeningAttempt.create({
        data: {
          userId,
          materialId: material.id,
          startedAt,
          submittedAt: new Date(startedAt.getTime() + duration * 1000),
          durationSeconds: duration,
          score: correctCount,
          totalPoints: total,
          percentage: Math.round((correctCount / total) * 1000) / 10,
          answers,
        },
      });
      addDay(userId, startedAt);

      const key = `${userId}:LISTENING`;
      const agg = progressAgg.get(key) ?? { skill: "LISTENING", completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
      agg.completed += 1;
      agg.correct += correctCount;
      agg.total += total;
      agg.seconds += duration;
      agg.sum += Math.round((correctCount / total) * 100);
      progressAgg.set(key, agg);
    }
  }

  // ── Writing ─────────────────────────────────────────────
  const sampleTexts = [
    "I want to become a software developer because I like solving problems. Every day I study algorithms and practice coding. I believe that technology will change the world, and I want to be part of that change.",
    "In the future I hope to work as a web developer in a international company. I am learning English because documentation is mostly in English. My goal is to get a good job and help my family.",
    "My dream job is a data scientist. I like mathematics and I like finding patterns in numbers. I think data is the future of business and I want to be an expert in this field.",
  ];

  for (let w = 0; w < WRITINGS.length; w++) {
    const seedW = WRITINGS[w];
    const assignment = await prisma.writingAssignment.create({
      data: {
        title: seedW.title,
        instructions: seedW.instructions,
        minWords: seedW.minWords,
        maxWords: seedW.maxWords,
        level: seedW.level,
        topic: seedW.topic,
        dueAt: new Date(today.getTime() + seedW.daysFromNow * DAY + 21 * 3600_000),
        status: "PUBLISHED",
        createdById: teacher.id,
      },
    });

    const submissionRate = w === 0 ? 0.65 : 0.2;
    for (const userId of studentIds) {
      if (!chance(submissionRate)) continue;
      const text = pick(sampleTexts);
      const graded = w === 0 && chance(0.55);
      const score = graded ? intBetween(65, 96) : null;
      await prisma.writingSubmission.create({
        data: {
          assignmentId: assignment.id,
          userId,
          text,
          wordCount: text.split(/\s+/).length,
          status: graded ? "GRADED" : "SUBMITTED",
          score,
          feedback: graded
            ? pick([
                "Good structure. Watch your article usage — 'a international' should be 'an international'.",
                "Nice ideas. Try to use more connecting words: however, moreover, finally.",
                "Clear and well organised. Add more details in the second paragraph.",
              ])
            : null,
          gradedAt: graded ? dayAt(intBetween(0, 3), 19) : null,
          gradedById: graded ? teacher.id : null,
          submittedAt: dayAt(intBetween(1, 6), intBetween(17, 22)),
        },
      });
      addDay(userId, dayAt(intBetween(1, 6), 18));
      const key = `${userId}:WRITING`;
      const agg = progressAgg.get(key) ?? { skill: "WRITING", completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
      if (score !== null) {
        agg.completed += 1;
        agg.sum += score;
        agg.seconds += 1200;
      }
      progressAgg.set(key, agg);
    }
  }

  // ── Vocabulary skill progress ───────────────────────────
  for (const userId of studentIds) {
    const rows = await prisma.vocabularyProgress.findMany({
      where: { userId },
      select: { correctCount: true, wrongCount: true, status: true },
    });
    if (!rows.length) continue;
    const correct = rows.reduce((s, r) => s + r.correctCount, 0);
    const wrong = rows.reduce((s, r) => s + r.wrongCount, 0);
    const total = correct + wrong || 1;
    const key = `${userId}:VOCABULARY`;
    progressAgg.set(key, {
      skill: "VOCABULARY",
      completed: rows.filter((r) => r.status === "LEARNED").length,
      correct,
      total,
      seconds: rows.length * 60,
      sum: Math.round((correct / total) * 100 * rows.length),
    });
  }

  // ── StudentProgress ─────────────────────────────────────
  for (const [key, agg] of progressAgg) {
    const userId = key.split(":")[0];
    await prisma.studentProgress.create({
      data: {
        userId,
        skill: agg.skill as Skill,
        completedCount: agg.completed,
        correctAnswers: agg.correct,
        totalAnswers: agg.total,
        totalSeconds: agg.seconds,
        averagePercentage: agg.completed ? Math.round((agg.sum / agg.completed) * 10) / 10 : 0,
        lastActivityAt: new Date(),
      },
    });
  }

  // ── Streaks ─────────────────────────────────────────────
  let streaks = 0;
  for (const userId of studentIds) {
    const days = [...(activityDays.get(userId) ?? new Set<string>())].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
    if (!days.length) continue;

    let longest = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }

    const last = days[days.length - 1];
    const gap = daysBetween(last, new Date());
    let current = 0;
    if (gap <= 1) {
      current = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (daysBetween(days[i - 1], days[i]) === 1) current++;
        else break;
      }
    }

    if (current > 0 || longest > 1) {
      await prisma.learningStreak.create({
        data: {
          userId,
          currentStreak: current,
          longestStreak: Math.max(longest, current),
          lastActivityOn: last,
        },
      });
      streaks++;
    }
  }

  // ── Notifications ───────────────────────────────────────
  const todaysAssignments = await prisma.testAssignment.findMany({
    where: { deadlineAt: { gte: startOfDay(new Date()) }, startAt: { lte: new Date() } },
    include: { test: { select: { title: true } }, group: { select: { name: true } } },
  });

  for (const a of todaysAssignments) {
    const members = await prisma.groupMember.findMany({ where: { groupId: a.groupId }, select: { studentId: true } });
    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.studentId,
        type: "TEST_ASSIGNED" as const,
        title: `New test: ${a.test.title}`,
        body: `${a.group.name} • due today ${a.deadlineAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        link: "/student/tests",
      })),
    });
  }

  const ungraded = await prisma.writingSubmission.findMany({ where: { status: "SUBMITTED" }, include: { assignment: true } });
  for (const s of ungraded.slice(0, 6)) {
    await prisma.notification.create({
      data: {
        userId: teacher.id,
        type: "WRITING_SUBMITTED",
        title: "New writing submission",
        body: `${s.assignment.title} — waiting for your feedback.`,
        link: "/teacher/learning/writing",
      },
    });
  }

  // ── Login activity for "who was active today" ──────────
  const todayCompletions = await prisma.testAttempt.findMany({
    where: { submittedAt: { gte: startOfDay(new Date()) } },
    select: { userId: true, submittedAt: true },
    distinct: ["userId"],
  });
  for (const c of todayCompletions) {
    await prisma.activityLog.create({
      data: { userId: c.userId, type: "LOGIN", createdAt: c.submittedAt ?? new Date() },
    });
  }

  const summary = {
    teacher: `teacher / ${TEACHER_PASSWORD}`,
    student: `<username> / ${STUDENT_PASSWORD}`,
    groups: GROUPS.length,
    students: STUDENTS.length,
    tests: tests.length,
    assignments: plans.reduce((s, p) => s + p.groups.length, 0),
    attempts: attemptCount,
    vocabulary: VOCABULARY.length,
    readings: READINGS.length,
    listenings: LISTENINGS.length,
    writings: WRITINGS.length,
    streaks,
  };

  console.log("\n[seed] Done. Summary:");
  console.table(summary);
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

