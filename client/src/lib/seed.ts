import type {
  ActivityType,
  AttemptStatus,
  Db,
  DbActivityLog,
  DbAnswer,
  DbAssignment,
  DbAttempt,
  DbGroup,
  DbGroupMember,
  DbNotification,
  DbOption,
  DbProgress,
  DbQuestion,
  DbReading,
  DbReadingAttempt,
  DbReadingQuestion,
  DbStreak,
  DbTest,
  DbUser,
  DbVocabulary,
  DbVocabularyProgress,
  Level,
  Skill,
} from "@/lib/types";
import { hashPassword, nowIso } from "@/lib/db";
import { gradeAttempt } from "@/lib/grading";
import { TEST_BANK } from "@/lib/seed/bank";
import { READINGS, VOCABULARY } from "@/lib/seed/content";

const DAY = 86_400_000;
const TEACHER_PASSWORD = "Teacher123!";
const STUDENT_PASSWORD = "student123";

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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

function usernameFor(first: string, last: string): string {
  return `${first}.${last}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['ʻʼ`]/g, "")
    .replace(/[^a-z0-9.]/g, "");
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

const GROUPS: Array<{ name: string; level: Level; description: string }> = [
  { name: "IT 1", level: "BEGINNER", description: "First year IT students — foundations of English." },
  { name: "IT 2", level: "ELEMENTARY", description: "Second year IT students — everyday English." },
  { name: "Beginner", level: "BEGINNER", description: "Absolute beginners, A0 → A1." },
  { name: "IELTS", level: "INTERMEDIATE", description: "IELTS preparation group, target 6.5+." },
];

type Ability = { userId: string; ability: number; group: string };

type SeededQuestion = DbQuestion & { options: DbOption[] };
type SeededTest = { test: DbTest; questions: SeededQuestion[] };

type AssignmentPlan = {
  testTitle: string;
  groups: string[];
  startAt: Date;
  deadlineAt: Date;
  completionRate: number;
};

export async function seedDatabase(db: Db): Promise<void> {
  const ts = nowIso();
  const teacherHash = await hashPassword(TEACHER_PASSWORD);
  const studentHash = await hashPassword(STUDENT_PASSWORD);

  const teacher: DbUser = {
    id: "usr_teacher",
    role: "TEACHER",
    firstName: "Nodira",
    lastName: "Yusupova",
    username: "teacher",
    passwordHash: teacherHash,
    avatarUrl: null,
    phone: null,
    age: null,
    status: "ACTIVE",
    lastLoginAt: null,
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
    studentProfile: null,
    teacherProfile: { subject: "English", bio: "English teacher • 8 years of experience" },
  };
  db.users.push(teacher);

  const groupIdByName = new Map<string, string>();
  for (const g of GROUPS) {
    const id = `grp_${slug(g.name)}`;
    const group: DbGroup = {
      id,
      name: g.name,
      level: g.level,
      description: g.description,
      status: "ACTIVE",
      createdById: teacher.id,
      createdAt: ts,
      updatedAt: ts,
    };
    db.groups.push(group);
    groupIdByName.set(g.name, id);
  }

  const abilities: Ability[] = [];
  const studentIds: string[] = [];

  for (const s of STUDENTS) {
    const username = usernameFor(s.first, s.last);
    const id = `usr_${username}`;
    const joinedAt = dayAt(intBetween(20, 90), 9);
    const user: DbUser = {
      id,
      role: "STUDENT",
      firstName: s.first,
      lastName: s.last,
      username,
      passwordHash: studentHash,
      avatarUrl: null,
      phone: s.phone,
      age: s.age,
      status: "ACTIVE",
      lastLoginAt: null,
      deletedAt: null,
      createdAt: ts,
      updatedAt: ts,
      studentProfile: {
        level: GROUPS.find((g) => g.name === s.group)!.level,
        bio: null,
        joinedAt: joinedAt.toISOString(),
      },
      teacherProfile: null,
    };
    db.users.push(user);
    const member: DbGroupMember = {
      id: `mem_${username}`,
      groupId: groupIdByName.get(s.group)!,
      studentId: id,
      joinedAt: joinedAt.toISOString(),
    };
    db.groupMembers.push(member);
    studentIds.push(id);
    const base = s.group === "IELTS" ? 0.74 : s.group === "Beginner" ? 0.52 : 0.63;
    abilities.push({ userId: id, ability: Math.min(0.97, base + rand() * 0.28), group: s.group });
  }

  const tests: SeededTest[] = [];
  const skillCounters = new Map<string, number>();

  for (const bank of TEST_BANK) {
    const n = (skillCounters.get(bank.skill) ?? 0) + 1;
    skillCounters.set(bank.skill, n);
    const testIndex = tests.length + 1;
    const testId = `tst_${slug(bank.skill)}_${n}`;
    const test: DbTest = {
      id: testId,
      title: bank.title,
      description: bank.description ?? null,
      topic: bank.topic,
      skill: bank.skill,
      difficulty: bank.difficulty,
      timeLimitSeconds: bank.timeLimitSeconds,
      passingScore: bank.passingScore,
      instructions: bank.instructions ?? null,
      type: "MANUAL",
      status: "PUBLISHED",
      aiPrompt: null,
      createdById: teacher.id,
      deletedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.tests.push(test);

    const questions: SeededQuestion[] = bank.questions.map((q, idx) => {
      const isTF = q.type === "TRUE_FALSE";
      const correctIndexes = Array.isArray(q.correct)
        ? q.correct
        : typeof q.correct === "number"
          ? [q.correct]
          : [];
      const questionId = `q_t${testIndex}_${idx + 1}`;
      const rawOptions = isTF
        ? ["True", "False"]
        : (q.options ?? []).map((text) => text);
      const options: DbOption[] = rawOptions.map((text, i) => ({
        id: `opt_t${testIndex}_${idx + 1}_${i}`,
        questionId,
        text,
        isCorrect: isTF ? i === correctIndexes[0] : correctIndexes.includes(i),
        order: i,
      }));
      const question: SeededQuestion = {
        id: questionId,
        testId,
        type: q.type,
        text: q.text,
        topic: bank.topic,
        explanation: q.explanation ?? null,
        correctAnswer: q.correctText ?? null,
        order: idx,
        points: 1,
        createdAt: ts,
        updatedAt: ts,
        options,
      };
      return question;
    });

    for (const question of questions) {
      db.questions.push({
        id: question.id,
        testId: question.testId,
        type: question.type,
        text: question.text,
        topic: question.topic,
        explanation: question.explanation,
        correctAnswer: question.correctAnswer,
        order: question.order,
        points: question.points,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      });
      for (const option of question.options) db.questionOptions.push(option);
    }

    tests.push({ test, questions });
  }

  const today = startOfDay(new Date());
  const plans: AssignmentPlan[] = [
    { testTitle: "Present Simple", groups: ["IT 1", "IT 2"], startAt: dayAt(14, 16), deadlineAt: dayAt(13, 23, 59), completionRate: 0.86 },
    { testTitle: "Vocabulary Challenge", groups: ["IT 1", "IT 2", "Beginner", "IELTS"], startAt: dayAt(10, 16), deadlineAt: dayAt(9, 23, 59), completionRate: 0.82 },
    { testTitle: "Past Simple", groups: ["IT 1", "IT 2"], startAt: dayAt(7, 17), deadlineAt: dayAt(6, 23, 59), completionRate: 0.8 },
    { testTitle: "Present Continuous", groups: ["IT 1", "Beginner"], startAt: dayAt(4, 17), deadlineAt: dayAt(3, 23, 59), completionRate: 0.78 },
    { testTitle: "Reading", groups: ["IT 1", "IT 2", "Beginner", "IELTS"], startAt: dayAt(2, 16), deadlineAt: dayAt(1, 23, 59), completionRate: 0.74 },
    { testTitle: "Past Simple", groups: ["IELTS"], startAt: new Date(today.getTime() + 6 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.72 },
    { testTitle: "Present Simple", groups: ["IT 1"], startAt: new Date(today.getTime() + 7 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.55 },
    { testTitle: "Vocabulary Challenge", groups: ["IT 2"], startAt: new Date(today.getTime() + 8 * 3600_000), deadlineAt: new Date(today.getTime() + 23 * 3600_000 + 59 * 60_000), completionRate: 0.5 },
    { testTitle: "Reading", groups: ["Beginner"], startAt: new Date(today.getTime() + 2 * DAY + 6 * 3600_000), deadlineAt: new Date(today.getTime() + 2 * DAY + 23 * 3600_000 + 59 * 60_000), completionRate: 0 },
    { testTitle: "Present Continuous", groups: ["IELTS"], startAt: new Date(today.getTime() + 3 * DAY + 7 * 3600_000), deadlineAt: new Date(today.getTime() + 3 * DAY + 23 * 3600_000 + 59 * 60_000), completionRate: 0 },
  ];

  const abilityByUser = new Map(abilities.map((a) => [a.userId, a]));
  const progressAgg = new Map<string, { skill: Skill; completed: number; correct: number; total: number; seconds: number; sum: number }>();
  const activityDays = new Map<string, Set<string>>();
  const addDay = (userId: string, d: Date) => {
    if (!activityDays.has(userId)) activityDays.set(userId, new Set());
    activityDays.get(userId)!.add(startOfDay(d).toISOString());
  };

  let attemptSeq = 0;
  let answerSeq = 0;
  let activitySeq = 0;
  const logActivity = (userId: string, type: ActivityType, meta: unknown, createdAt: string) => {
    activitySeq++;
    const row: DbActivityLog = { id: `act_${activitySeq}`, userId, type, meta, createdAt };
    db.activityLogs.push(row);
  };

  for (const plan of plans) {
    const entryIndex = tests.findIndex((t) => t.test.title.startsWith(plan.testTitle));
    if (entryIndex < 0) continue;
    const { test, questions } = tests[entryIndex];

    for (const groupName of plan.groups) {
      const groupId = groupIdByName.get(groupName)!;
      const assignmentId = `asg_t${entryIndex + 1}_${slug(groupName)}`;
      const startAtIso = plan.startAt.toISOString();
      const deadlineAtIso = plan.deadlineAt.toISOString();
      const existing = db.assignments.find((a) => a.testId === test.id && a.groupId === groupId);
      if (existing) {
        existing.startAt = startAtIso;
        existing.deadlineAt = deadlineAtIso;
        existing.durationSeconds = test.timeLimitSeconds;
        existing.assignedById = teacher.id;
        existing.status = "ACTIVE";
        existing.updatedAt = ts;
      } else {
        const assignment: DbAssignment = {
          id: assignmentId,
          testId: test.id,
          groupId,
          assignedById: teacher.id,
          startAt: startAtIso,
          deadlineAt: deadlineAtIso,
          durationSeconds: test.timeLimitSeconds,
          maxAttempts: 1,
          status: "ACTIVE",
          createdAt: ts,
          updatedAt: ts,
        };
        db.assignments.push(assignment);
      }

      const members = db.groupMembers.filter((m) => m.groupId === groupId);

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
        const status: AttemptStatus =
          durationSeconds >= test.timeLimitSeconds * 0.97 ? "TIME_UP" : "SUBMITTED";

        const answers: Array<{ questionId: string; answerText: string | null; selectedOptionIds: string[] }> = [];
        for (const question of questions) {
          if (chance(0.03)) continue;
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
            let chosen: DbOption[];
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

        const graded = gradeAttempt(questions, answers);
        attemptSeq++;
        const attemptId = `att_${attemptSeq}`;
        const attempt: DbAttempt = {
          id: attemptId,
          userId: member.studentId,
          testId: test.id,
          assignmentId,
          startedAt: startedAt.toISOString(),
          expiresAt: new Date(startedAt.getTime() + test.timeLimitSeconds * 1000).toISOString(),
          submittedAt: submittedAt.toISOString(),
          durationSeconds,
          score: graded.score,
          totalPoints: graded.totalPoints,
          percentage: graded.percentage,
          status,
          tabSwitches: chance(0.3) ? intBetween(1, 4) : chance(0.08) ? 6 : 0,
          refreshCount: chance(0.2) ? 1 : 0,
          createdAt: ts,
          updatedAt: ts,
        };
        db.attempts.push(attempt);

        for (const a of answers) {
          answerSeq++;
          const row: DbAnswer = {
            id: `ans_${answerSeq}`,
            attemptId,
            questionId: a.questionId,
            answerText: a.answerText,
            selectedOptionIds: a.selectedOptionIds,
            isCorrect: graded.details.find((d) => d.questionId === a.questionId)?.isCorrect ?? null,
            answeredAt: startedAt.toISOString(),
          };
          db.answers.push(row);
        }

        logActivity(member.studentId, "TEST_STARTED", { attemptId, testId: test.id }, startedAt.toISOString());
        logActivity(
          member.studentId,
          status === "TIME_UP" ? "AUTO_SUBMITTED" : "TEST_SUBMITTED",
          { attemptId, percentage: graded.percentage },
          submittedAt.toISOString(),
        );

        const key = `${member.studentId}:${test.skill}`;
        const agg =
          progressAgg.get(key) ??
          { skill: test.skill, completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
        agg.completed += 1;
        agg.correct += graded.correctCount;
        agg.total += questions.length;
        agg.seconds += durationSeconds;
        agg.sum += graded.percentage;
        progressAgg.set(key, agg);
        addDay(member.studentId, startedAt);
        addDay(member.studentId, submittedAt);
      }
    }
  }

  const it1 = groupIdByName.get("IT 1")!;
  const liveEntry = tests.find((t) => t.test.title.startsWith("Present Simple"));
  const liveAssignment = liveEntry
    ? db.assignments.find(
        (a) => a.testId === liveEntry.test.id && a.groupId === it1 && a.deadlineAt >= new Date().toISOString(),
      )
    : undefined;
  if (liveEntry && liveAssignment) {
    const members = db.groupMembers.filter((m) => m.groupId === it1);
    const target = members.find((m) => {
      const a = abilityByUser.get(m.studentId)!;
      return a.ability > 0.7 && a.ability < 0.85;
    });
    if (target) {
      const startedAt = new Date(Date.now() - 6 * 60_000);
      attemptSeq++;
      const attempt: DbAttempt = {
        id: `att_${attemptSeq}`,
        userId: target.studentId,
        testId: liveEntry.test.id,
        assignmentId: liveAssignment.id,
        startedAt: startedAt.toISOString(),
        expiresAt: new Date(startedAt.getTime() + liveEntry.test.timeLimitSeconds * 1000).toISOString(),
        submittedAt: null,
        durationSeconds: null,
        score: 0,
        totalPoints: liveEntry.questions.reduce((sum, q) => sum + q.points, 0),
        percentage: 0,
        status: "IN_PROGRESS",
        tabSwitches: 0,
        refreshCount: 0,
        createdAt: ts,
        updatedAt: ts,
      };
      db.attempts.push(attempt);
      logActivity(target.studentId, "TEST_STARTED", { live: true, attemptId: attempt.id }, startedAt.toISOString());
    }
  }

  const vocabularyIds: string[] = [];
  for (let i = 0; i < VOCABULARY.length; i++) {
    const v = VOCABULARY[i];
    const id = `voc_${i + 1}`;
    const row: DbVocabulary = {
      id,
      word: v.word,
      uzbek: v.uzbek,
      russian: v.russian,
      example: v.example,
      pronunciation: v.pronunciation,
      category: v.category,
      level: v.level,
      createdById: teacher.id,
      createdAt: ts,
      updatedAt: ts,
    };
    db.vocabulary.push(row);
    vocabularyIds.push(id);
  }

  for (const userId of studentIds) {
    for (const id of vocabularyIds) {
      if (!chance(0.55)) continue;
      const learned = chance(0.6);
      const row: DbVocabularyProgress = {
        id: `vp_${userId}_${id}`,
        userId,
        vocabularyId: id,
        status: learned ? "LEARNED" : "LEARNING",
        correctCount: intBetween(1, 6),
        wrongCount: intBetween(0, 3),
        masteredAt: learned ? dayAt(intBetween(1, 20), 18).toISOString() : null,
        createdAt: ts,
        updatedAt: ts,
      };
      db.vocabularyProgress.push(row);
      if (chance(0.35)) addDay(userId, dayAt(intBetween(0, 13), 19));
    }
  }

  for (let r = 0; r < READINGS.length; r++) {
    const seedReading = READINGS[r];
    const materialId = `rdg_${r + 1}`;
    const material: DbReading = {
      id: materialId,
      title: seedReading.title,
      level: seedReading.level,
      topic: seedReading.topic,
      text: seedReading.text,
      estimatedMinutes: seedReading.estimatedMinutes,
      status: "PUBLISHED",
      createdById: teacher.id,
      createdAt: ts,
      updatedAt: ts,
    };
    db.readings.push(material);
    const materialQuestions: DbReadingQuestion[] = seedReading.questions.map((q, i) => ({
      id: `rq_${r + 1}_${i + 1}`,
      materialId,
      text: q.text,
      options: q.options,
      correctAnswer: String(q.correct),
      order: i,
      points: 1,
    }));
    for (const q of materialQuestions) db.readingQuestions.push(q);

    for (const userId of studentIds) {
      if (!chance(0.6)) continue;
      const startedAt = dayAt(intBetween(1, 13), intBetween(16, 22), intBetween(0, 59));
      const duration = intBetween(120, 600);
      const ability = abilityByUser.get(userId)!.ability;
      const correctCount = materialQuestions.filter(() => chance(ability)).length;
      const total = materialQuestions.length;
      const answers = materialQuestions.map((q, i) => ({
        questionId: q.id,
        answer: i < correctCount ? q.options[Number(q.correctAnswer)] : "0",
      }));
      const readingAttemptSeq = db.readingAttempts.length + 1;
      const readingAttempt: DbReadingAttempt = {
        id: `ratt_${readingAttemptSeq}`,
        userId,
        materialId,
        startedAt: startedAt.toISOString(),
        submittedAt: new Date(startedAt.getTime() + duration * 1000).toISOString(),
        durationSeconds: duration,
        score: correctCount,
        totalPoints: total,
        percentage: Math.round((correctCount / total) * 1000) / 10,
        answers,
      };
      db.readingAttempts.push(readingAttempt);
      addDay(userId, startedAt);

      const key = `${userId}:READING`;
      const agg = progressAgg.get(key) ?? { skill: "READING" as Skill, completed: 0, correct: 0, total: 0, seconds: 0, sum: 0 };
      agg.completed += 1;
      agg.correct += correctCount;
      agg.total += total;
      agg.seconds += duration;
      agg.sum += Math.round((correctCount / total) * 100);
      progressAgg.set(key, agg);
    }
  }

  for (const userId of studentIds) {
    const rows = db.vocabularyProgress.filter((r) => r.userId === userId);
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

  for (const [key, agg] of progressAgg) {
    const userId = key.split(":")[0];
    const row: DbProgress = {
      id: `prg_${userId}_${agg.skill}`,
      userId,
      skill: agg.skill,
      completedCount: agg.completed,
      correctAnswers: agg.correct,
      totalAnswers: agg.total,
      totalSeconds: agg.seconds,
      averagePercentage: agg.completed ? Math.round((agg.sum / agg.completed) * 10) / 10 : 0,
      lastActivityAt: new Date().toISOString(),
      updatedAt: ts,
    };
    db.progress.push(row);
  }

  for (const userId of studentIds) {
    const days = [...(activityDays.get(userId) ?? new Set<string>())]
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime());
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
      const row: DbStreak = {
        id: `stk_${userId}`,
        userId,
        currentStreak: current,
        longestStreak: Math.max(longest, current),
        lastActivityOn: last.toISOString(),
        updatedAt: ts,
      };
      db.streaks.push(row);
    }
  }

  let notificationSeq = 0;
  const now = new Date();
  const todaysAssignments = db.assignments.filter(
    (a) => a.deadlineAt >= startOfDay(now).toISOString() && a.startAt <= now.toISOString(),
  );

  for (const a of todaysAssignments) {
    const test = db.tests.find((t) => t.id === a.testId);
    const group = db.groups.find((g) => g.id === a.groupId);
    if (!test || !group) continue;
    const members = db.groupMembers.filter((m) => m.groupId === a.groupId);
    for (const m of members) {
      notificationSeq++;
      const row: DbNotification = {
        id: `ntf_${notificationSeq}`,
        userId: m.studentId,
        type: "TEST_ASSIGNED",
        title: `New test: ${test.title}`,
        body: `${group.name} • due today ${new Date(a.deadlineAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        link: "/student/tests",
        readAt: null,
        createdAt: nowIso(),
      };
      db.notifications.push(row);
    }
  }

  const seenLogin = new Set<string>();
  const dayStartIso = startOfDay(new Date()).toISOString();
  for (const a of db.attempts) {
    if (!a.submittedAt || a.submittedAt < dayStartIso) continue;
    if (seenLogin.has(a.userId)) continue;
    seenLogin.add(a.userId);
    logActivity(a.userId, "LOGIN", null, a.submittedAt);
  }

  db.meta.seededAt = nowIso();
}
