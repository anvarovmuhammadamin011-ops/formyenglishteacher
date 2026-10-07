export type Role = "TEACHER" | "STUDENT";
export type Level =
  | "BEGINNER"
  | "ELEMENTARY"
  | "PRE_INTERMEDIATE"
  | "INTERMEDIATE"
  | "UPPER_INTERMEDIATE"
  | "ADVANCED";
export type Skill = "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING" | "WRITING";
export type QuestionType =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "MULTIPLE_SELECT"
  | "FILL_BLANK"
  | "SHORT_ANSWER"
  | "MATCHING";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "TIME_UP" | "EXPIRED";
export type AssignmentState = "AVAILABLE" | "IN_PROGRESS" | "COMPLETED" | "SCHEDULED" | "MISSED" | "EXHAUSTED";

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  phone?: string | null;
  age?: number | null;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface SessionUser extends User {
  studentProfile?: { level: Level; bio: string | null } | null;
  teacherProfile?: { subject: string | null; bio: string | null } | null;
  group?: { id: string; name: string; level: Level } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface TestRef {
  id: string;
  title: string;
  topic?: string | null;
  skill: Skill;
  difficulty?: Level;
}

export interface Group {
  id: string;
  name: string;
  level: Level;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  studentCount?: number;
  createdAt?: string;
}

export interface GroupStatsRow extends Group {
  activeStudents?: number;
  averageScore?: number | null;
}

export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  age: number | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  lastLoginAt: string | null;
  studentProfile: { level: Level } | null;
  streak: { currentStreak: number; longestStreak: number } | null;
  group: { id: string; name: string; level: Level } | null;
}

export interface Test {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  skill: Skill;
  difficulty: Level;
  type: "MANUAL" | "AI";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  timeLimitSeconds: number;
  passingScore: number;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { questions: number; attempts: number };
}

export interface TestQuestion {
  id: string;
  type: QuestionType;
  text: string;
  topic: string | null;
  explanation: string | null;
  correctAnswer: string | null;
  order: number;
  points: number;
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
}

export interface TestDetail extends Test {
  questions: TestQuestion[];
}

export interface TeacherAssignment {
  id: string;
  test: { id: string; title: string; topic: string | null; difficulty: Level; timeLimitSeconds: number };
  group: { id: string; name: string; level: Level };
  assignedBy: { firstName: string; lastName: string };
  startAt: string;
  deadlineAt: string;
  durationSeconds: number | null;
  maxAttempts: number;
  status: "ACTIVE" | "CLOSED";
  completedCount: number;
  studentCount: number;
  completionRate: number;
}

export interface AssignedRow {
  assignmentId: string;
  state: AssignmentState;
  startAt: string;
  deadlineAt: string;
  durationSeconds: number;
  maxAttempts: number;
  attemptsUsed: number;
  group: { id: string; name: string };
  test: {
    id: string;
    title: string;
    topic: string | null;
    skill: Skill;
    difficulty: Level;
    timeLimitSeconds: number;
    passingScore: number;
    questionCount: number;
  };
  activeAttempt: { id: string; startedAt: string; expiresAt: string | null } | null;
  bestResult: {
    id: string;
    percentage: number;
    score: number;
    totalPoints: number;
    submittedAt: string | null;
    durationSeconds: number | null;
  } | null;
}

export interface AttemptQuestion {
  id: string;
  type: QuestionType;
  text: string;
  order: number;
  points: number;
  options: Array<{ id: string; text: string }>;
}

export interface AttemptView {
  id: string;
  testId: string;
  assignmentId: string | null;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  serverNow: string;
  remainingSeconds: number | null;
  expired: boolean;
  test: {
    id: string;
    title: string;
    description: string | null;
    topic: string | null;
    skill: Skill;
    difficulty: Level;
    instructions: string | null;
    timeLimitSeconds: number;
    passingScore: number;
  };
  questions: AttemptQuestion[];
  answers: Array<{ questionId: string; answerText: string | null; selectedOptionIds: string[] }>;
}

export interface AttemptAnswerInput {
  questionId: string;
  answerText?: string | null;
  selectedOptionIds?: string[];
}

export interface AttemptResult {
  id: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
  durationSeconds: number | null;
  score: number;
  totalPoints: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  pendingCount: number;
  tabSwitches: number;
  refreshCount: number;
  passed: boolean;
  test: { id: string; title: string; topic: string | null; skill: Skill; difficulty: Level; passingScore: number };
  student: { id: string; firstName: string; lastName: string; username: string };
  group: { id: string; name: string } | null;
  questions?: Array<{
    id: string;
    type: QuestionType;
    text: string;
    points: number;
    explanation: string | null;
    topic: string | null;
    options: Array<{ id: string; text: string; isCorrect: boolean }>;
    correctAnswer: string | null;
    yourAnswer: { answerText: string | null; selectedOptionIds: string[] };
    isCorrect: boolean | null;
    answered: boolean;
  }>;
}

export interface AttemptHistoryItem {
  id: string;
  status: AttemptStatus;
  score: number;
  totalPoints: number;
  percentage: number;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  test: { id: string; title: string; topic: string | null; skill: Skill; difficulty: Level };
  assignment: { group: { name: string } } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface VocabularyWord {
  id: string;
  word: string;
  uzbek: string;
  russian: string | null;
  example: string | null;
  pronunciation: string | null;
  category: string | null;
  level: Level;
  status: "NEW" | "LEARNING" | "LEARNED";
  correctCount: number;
  wrongCount: number;
  masteredAt: string | null;
}

export interface VocabularyStats {
  total: number;
  learned: number;
  learning: number;
  new: number;
  accuracy: number;
}

export interface MaterialListItem {
  id: string;
  title: string;
  level: Level;
  topic: string | null;
  status: "DRAFT" | "PUBLISHED";
  estimatedMinutes: number;
  questions: number;
  attempts: number;
  bestScore: number | null;
  createdAt: string;
  audioUrl?: string;
}

export interface MaterialDetail {
  id: string;
  title: string;
  level: Level;
  topic: string | null;
  status: string;
  estimatedMinutes: number;
  transcriptUnlocked: boolean;
  text?: string;
  audioUrl?: string;
  transcript?: string | null;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    order: number;
    points: number;
    correctAnswer?: string;
  }>;
  attempts: Array<{
    id: string;
    submittedAt: string | null;
    percentage: number;
    score: number;
    totalPoints: number;
    durationSeconds: number | null;
  }>;
}

export interface MaterialSubmitResult {
  attemptId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  detail: Array<{ id: string; text: string; options: string[]; correctAnswer: string; points: number }>;
}

export interface WritingListItem {
  id: string;
  title: string;
  instructions: string;
  minWords: number;
  maxWords: number;
  level: Level;
  topic: string | null;
  dueAt: string | null;
  status: "DRAFT" | "PUBLISHED";
  submissions: number;
  myStatus?: string | null;
  myScore?: number | null;
  submitted?: boolean;
}

export interface WritingDetail {
  id: string;
  title: string;
  instructions: string;
  minWords: number;
  maxWords: number;
  level: Level;
  topic: string | null;
  dueAt: string | null;
  status: string;
  submission: {
    id: string;
    text: string;
    wordCount: number;
    status: "SUBMITTED" | "GRADED";
    score: number | null;
    feedback: string | null;
    submittedAt: string;
    gradedAt: string | null;
  } | null;
}

export interface WritingSubmissionRow {
  id: string;
  user: { id: string; firstName: string; lastName: string; username: string; avatarUrl: string | null };
  text: string;
  wordCount: number;
  status: "SUBMITTED" | "GRADED";
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}

export interface TeacherDashboard {
  summary: { students: number; groups: number; tests: number; attempts30d: number; averageScore30d: number };
  chart: Array<{ date: string; attempts: number; averageScore: number }>;
  skillBreakdown: Array<{ skill: Skill; averageScore: number; attempts: number }>;
  upcomingDeadlines: Array<{
    id: string;
    testId: string;
    title: string;
    skill: Skill;
    group: string;
    groupId: string;
    deadlineAt: string;
    students: number;
    completed: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    meta?: unknown;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string; role: Role; avatarUrl: string | null };
  }>;
}

export interface StudentDashboard {
  streak: { current: number; longest: number; lastActivityOn: string | null };
  summary: {
    testsCompleted: number;
    averageScore: number;
    rank: number | null;
    totalStudents: number;
    totalSeconds: number;
    inProgress: number;
  };
  skillProgress: Array<{
    skill: Skill;
    completed: number;
    accuracy: number;
    averageScore: number;
    lastActivityAt: string | null;
  }>;
  inProgressTests: Array<{
    id: string;
    assignmentId: string | null;
    title: string;
    skill: Skill;
    startedAt: string;
    expiresAt: string | null;
  }>;
  upcoming: Array<{
    assignmentId: string;
    testId: string;
    title: string;
    skill: Skill;
    difficulty: Level;
    group: string;
    deadlineAt: string;
    timeLimitSeconds: number;
    finished: boolean;
    bestScore: number | null;
    attemptsUsed: number;
    maxAttempts: number;
  }>;
  recentAttempts: Array<{
    id: string;
    percentage: number;
    submittedAt: string | null;
    correct: number;
    total: number;
    test: { id: string; title: string; skill: Skill; difficulty: Level };
  }>;
  calendar: Array<{ date: string; active: boolean }>;
}

export interface RankingRow {
  rank: number;
  userId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  tests: number;
  averageScore: number;
  streak: number;
  longestStreak: number;
}

export interface CalendarEvent {
  id: string;
  date: string;
  type: "DEADLINE" | "START";
  title: string;
  detail: string;
  link: string;
  startAt: string;
  deadlineAt: string;
  skill: Skill;
  completed?: boolean;
}

export interface StudentDetailReport {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    avatarUrl: string | null;
    age: number | null;
    phone: string | null;
    status: "ACTIVE" | "INACTIVE";
    level: Level | null;
    bio: string | null;
    joinedAt: string;
    lastLoginAt: string | null;
    groups: Array<{ id: string; name: string; level: Level }>;
    streak: { currentStreak: number; longestStreak: number; lastActivityOn: string | null };
  };
  summary: { testsCompleted: number; averageScore: number; totalSeconds: number; bestScore: number };
  skillChart: Array<{ skill: Skill; attempts: number; averageScore: number; accuracy: number; completed: number }>;
  dailyChart: Array<{ date: string; attempts: number; averageScore: number }>;
  recentAttempts: Array<{
    id: string;
    status: AttemptStatus;
    percentage: number;
    startedAt: string;
    submittedAt: string | null;
    test: TestRef;
    group: string | null;
  }>;
}

export interface GroupDetailReport {
  group: Group & { createdAt: string };
  skillAverages: Array<{ skill: Skill; attempts: number; averageScore: number }>;
  members: Array<{
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    avatarUrl: string | null;
    status: string;
    joinedAt: string;
    streak: number;
    tests: number;
    averageScore: number | null;
    skills: Array<{ skill: Skill; averageScore: number | null; attempts: number }>;
    vocabulary: number;
  }>;
  assignments: Array<{
    id: string;
    testId: string;
    title: string;
    skill: Skill;
    startAt: string;
    deadlineAt: string;
    status: string;
    students: number;
    completed: number;
    averageScore: number | null;
  }>;
}

export interface TestResultsReport {
  test: TestDetail | (Test & { questions?: unknown });
  summary: {
    assignedStudents: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    average: number;
    highest: number;
    lowest: number;
    averageDurationSeconds: number;
    passRate: number;
  };
  assignments: Array<{
    id: string;
    group: { id: string; name: string; level: Level };
    startAt: string;
    deadlineAt: string;
    durationSeconds: number | null;
    status: string;
  }>;
  attempts: Array<{
    id: string;
    student: { id: string; firstName: string; lastName: string; username: string; avatarUrl?: string | null };
    group: { id: string; name: string } | null;
    score: number;
    totalPoints: number;
    percentage: number;
    durationSeconds: number | null;
    startedAt: string;
    submittedAt: string | null;
    status: AttemptStatus;
    tabSwitches: number;
    refreshCount: number;
  }>;
  questionAnalysis: Array<{
    id: string;
    order: number;
    text: string;
    type: QuestionType;
    topic: string | null;
    correctCount: number;
    answeredCount: number;
    attemptCount: number;
    correctPct: number;
    options: Array<{ id: string; text: string; isCorrect: boolean; chosenCount: number }>;
  }>;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
}

export interface AiRequestRow {
  id: string;
  type: string;
  status: string;
  prompt: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

/* ────────────────────────────── Local DB schema ──────────────────────────────
   Everything below mirrors server/prisma/schema.prisma, but dates are ISO
   strings and relations are foreign-key id fields instead of objects. */

export type NotificationType =
  | "GENERAL"
  | "TEST_ASSIGNED"
  | "TEST_RESULT"
  | "DEADLINE_REMINDER"
  | "NEW_VOCABULARY"
  | "NEW_READING"
  | "NEW_LISTENING"
  | "WRITING_ASSIGNED"
  | "WRITING_GRADED"
  | "STUDENT_COMPLETED"
  | "WRITING_SUBMITTED";

export type ActivityType =
  | "LOGIN"
  | "LOGOUT"
  | "TEST_STARTED"
  | "TEST_SUBMITTED"
  | "TEST_RESUMED"
  | "TAB_BLUR"
  | "PAGE_REFRESH"
  | "AUTO_SUBMITTED"
  | "VOCABULARY_PRACTICE"
  | "READING_COMPLETED"
  | "LISTENING_COMPLETED"
  | "WRITING_SUBMITTED";

export type VocabularyStatus = "NEW" | "LEARNING" | "LEARNED";
export type ContentStatus = "DRAFT" | "PUBLISHED";
export type GroupStatus = "ACTIVE" | "ARCHIVED";
export type AssignmentStatus = "ACTIVE" | "CLOSED";
export type TestStatusValue = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
}

export interface DbUser {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  username: string;
  passwordHash: string;
  avatarUrl: string | null;
  phone: string | null;
  age: number | null;
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  studentProfile: { level: Level; bio: string | null; joinedAt: string } | null;
  teacherProfile: { subject: string | null; bio: string | null } | null;
}

export interface DbGroup {
  id: string;
  name: string;
  level: Level;
  description: string | null;
  status: GroupStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbGroupMember {
  id: string;
  groupId: string;
  studentId: string;
  joinedAt: string;
}

export interface DbTest {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  skill: Skill;
  difficulty: Level;
  timeLimitSeconds: number;
  passingScore: number;
  instructions: string | null;
  type: "MANUAL" | "AI";
  status: TestStatusValue;
  aiPrompt: string | null;
  createdById: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbQuestion {
  id: string;
  testId: string;
  type: QuestionType;
  text: string;
  topic: string | null;
  explanation: string | null;
  correctAnswer: string | null;
  order: number;
  points: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface DbAssignment {
  id: string;
  testId: string;
  groupId: string;
  assignedById: string | null;
  startAt: string;
  deadlineAt: string;
  durationSeconds: number | null;
  maxAttempts: number;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DbAttempt {
  id: string;
  userId: string;
  testId: string;
  assignmentId: string | null;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  durationSeconds: number | null;
  score: number;
  totalPoints: number;
  percentage: number;
  status: AttemptStatus;
  tabSwitches: number;
  refreshCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  answerText: string | null;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  answeredAt: string;
}

export interface DbVocabulary {
  id: string;
  word: string;
  uzbek: string;
  russian: string | null;
  example: string | null;
  pronunciation: string | null;
  category: string | null;
  level: Level;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbVocabularyProgress {
  id: string;
  userId: string;
  vocabularyId: string;
  status: VocabularyStatus;
  correctCount: number;
  wrongCount: number;
  masteredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbReading {
  id: string;
  title: string;
  level: Level;
  topic: string | null;
  text: string;
  estimatedMinutes: number;
  status: ContentStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbReadingQuestion {
  id: string;
  materialId: string;
  text: string;
  options: string[];
  correctAnswer: string;
  order: number;
  points: number;
}

export interface DbReadingAttempt {
  id: string;
  userId: string;
  materialId: string;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  score: number;
  totalPoints: number;
  percentage: number;
  answers: Array<{ questionId: string; answer: number | string | null }>;
}

export interface DbNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DbActivityLog {
  id: string;
  userId: string;
  type: ActivityType;
  meta?: unknown;
  createdAt: string;
}

export interface DbStreak {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityOn: string | null;
  updatedAt: string;
}

export interface DbProgress {
  id: string;
  userId: string;
  skill: Skill;
  completedCount: number;
  correctAnswers: number;
  totalAnswers: number;
  totalSeconds: number;
  averagePercentage: number;
  lastActivityAt: string | null;
  updatedAt: string;
}

export interface DbAiRequest {
  id: string;
  userId: string | null;
  type: string;
  prompt: string;
  output?: unknown;
  status: "PENDING" | "SUCCESS" | "ERROR";
  model: string | null;
  error: string | null;
  durationMs: number | null;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
}

export interface Db {
  version: number;
  sessionUserId: string | null;
  aiConfig: AiConfig;
  users: DbUser[];
  groups: DbGroup[];
  groupMembers: DbGroupMember[];
  tests: DbTest[];
  questions: DbQuestion[];
  questionOptions: DbOption[];
  assignments: DbAssignment[];
  attempts: DbAttempt[];
  answers: DbAnswer[];
  vocabulary: DbVocabulary[];
  vocabularyProgress: DbVocabularyProgress[];
  readings: DbReading[];
  readingQuestions: DbReadingQuestion[];
  readingAttempts: DbReadingAttempt[];
  notifications: DbNotification[];
  activityLogs: DbActivityLog[];
  streaks: DbStreak[];
  progress: DbProgress[];
  aiRequests: DbAiRequest[];
  meta: { seededAt: string | null; updatedAt: string };
}
