import type { Db, DbUser } from "@/lib/types";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "ERROR", details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function fail(status: number, message: string, code?: string, details?: unknown): never {
  throw new HttpError(status, message, code, details);
}

export function badRequest(message: string, details?: unknown): never {
  fail(400, message, "VALIDATION_ERROR", details);
}

export function unauthorized(message = "Authentication required"): never {
  fail(401, message, "UNAUTHORIZED");
}

export function forbidden(message = "Not allowed"): never {
  fail(403, message, "FORBIDDEN");
}

export function notFound(message = "Not found"): never {
  fail(404, message, "NOT_FOUND");
}

export type Ctx = {
  db: Db;
  user: DbUser | undefined;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  requireUser: () => DbUser;
  requireTeacher: () => DbUser;
  requireStudent: () => DbUser;
};

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

export function makeCtx(
  db: Db,
  user: DbUser | undefined,
  params: Record<string, string>,
  query: Record<string, string>,
  body: any,
): Ctx {
  const requireUser = (): DbUser => {
    if (!user) unauthorized();
    return user;
  };
  return {
    db,
    user,
    params,
    query,
    body,
    requireUser,
    requireTeacher: () => {
      const u = requireUser();
      if (u.role !== "TEACHER") forbidden("Teacher access only");
      return u;
    },
    requireStudent: () => {
      const u = requireUser();
      if (u.role !== "STUDENT") forbidden("Student access only");
      return u;
    },
  };
}

/* ---------- query helpers ---------- */

export function qStr(ctx: Ctx, key: string, fallback = ""): string {
  const v = ctx.query[key];
  return v === undefined || v === "" ? fallback : v;
}

export function qInt(ctx: Ctx, key: string, fallback: number): number {
  const raw = ctx.query[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function qBool(ctx: Ctx, key: string, fallback = false): boolean {
  const raw = ctx.query[key];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export type Page = { page: number; limit: number; skip: number; take: number };

export function page(ctx: Ctx, defaultLimit = 20, maxLimit = 200): Page {
  const p = Math.max(1, qInt(ctx, "page", 1));
  const l = Math.min(maxLimit, Math.max(1, qInt(ctx, "limit", defaultLimit)));
  return { page: p, limit: l, skip: (p - 1) * l, take: l };
}

export function okList<T>(items: T[], total: number, pg: Page) {
  return {
    items,
    total,
    page: pg.page,
    limit: pg.limit,
    pages: Math.max(1, Math.ceil(total / pg.limit)),
  };
}

/* ---------- misc ---------- */

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
