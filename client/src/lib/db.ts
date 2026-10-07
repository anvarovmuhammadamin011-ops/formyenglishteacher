import type { ActivityType, Db, DbUser, Level, NotificationType, Role } from "@/lib/types";

const STORAGE_KEY = "elms_db_v1";
const DB_VERSION = 1;

let cache: Db | null = null;

function emptyDb(): Db {
  const now = new Date().toISOString();
  return {
    version: DB_VERSION,
    sessionUserId: null,
    aiConfig: {
      provider: "deepseek",
      apiKey: "",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      maxTokens: 4096,
      temperature: 0.7,
    },
    users: [],
    groups: [],
    groupMembers: [],
    tests: [],
    questions: [],
    questionOptions: [],
    assignments: [],
    attempts: [],
    answers: [],
    vocabulary: [],
    vocabularyProgress: [],
    readings: [],
    readingQuestions: [],
    readingAttempts: [],
    notifications: [],
    activityLogs: [],
    streaks: [],
    progress: [],
    aiRequests: [],
    meta: { seededAt: null, updatedAt: now },
  };
}

export function loadDb(): Db {
  if (cache) return cache;
  let parsed: Db | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) as Db;
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.version !== DB_VERSION) {
    parsed = emptyDb();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      /* storage full / unavailable — run in-memory */
    }
  }
  cache = parsed;
  return cache;
}

export function saveDb(db: Db): void {
  db.meta.updatedAt = new Date().toISOString();
  cache = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
}

/** Runs a mutation against the in-memory db and persists it. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = loadDb();
  const result = fn(db);
  saveDb(db);
  return result;
}

export function resetDb(): Db {
  const fresh = emptyDb();
  cache = fresh;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  saveDb(fresh);
  return fresh;
}

export function uid(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* ---------- password hashing (SHA-256, demo-grade, client-only) ---------- */

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  return `sha256:${await sha256Hex(`elms::${password}`)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith("sha256:")) return (await hashPassword(password)) === hash;
  // legacy bcrypt hash from the old seed — accept exact match only (demo accounts)
  return hash === password;
}

/* ---------- lookup helpers ---------- */

export function findUser(db: Db, id: string | null | undefined): DbUser | undefined {
  if (!id) return undefined;
  return db.users.find((u) => u.id === id && !u.deletedAt);
}

export function currentUser(db: Db): DbUser | undefined {
  return findUser(db, db.sessionUserId);
}

export function groupOf(db: Db, studentId: string) {
  const member = db.groupMembers.find((m) => m.studentId === studentId);
  if (!member) return undefined;
  return db.groups.find((g) => g.id === member.groupId);
}

export function studentLevel(user: DbUser | undefined): Level | undefined {
  return user?.studentProfile?.level ?? undefined;
}

export function pushNotification(
  db: Db,
  userId: string,
  type: NotificationType,
  title: string,
  body?: string | null,
  link?: string | null,
): void {
  db.notifications.push({
    id: uid("ntf"),
    userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
    readAt: null,
    createdAt: nowIso(),
  });
}

export function logActivity(
  db: Db,
  userId: string,
  type: ActivityType,
  meta?: Record<string, unknown>,
): void {
  db.activityLogs.push({
    id: uid("act"),
    userId,
    type,
    meta: (meta ?? null) as never,
    createdAt: nowIso(),
  });
}

export function getStreak(db: Db, userId: string) {
  let streak = db.streaks.find((s) => s.userId === userId);
  if (!streak) {
    streak = {
      id: uid("stk"),
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityOn: null,
      updatedAt: nowIso(),
    };
    db.streaks.push(streak);
  }
  return streak;
}

export function getProgress(db: Db, userId: string, skill: string) {
  let row = db.progress.find((p) => p.userId === userId && p.skill === skill);
  if (!row) {
    row = {
      id: uid("prg"),
      userId,
      skill: skill as never,
      completedCount: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      totalSeconds: 0,
      averagePercentage: 0,
      lastActivityAt: null,
      updatedAt: nowIso(),
    };
    db.progress.push(row);
  }
  return row;
}

export type { Db, DbUser, Role };
