import { findUser, loadDb } from "@/lib/db";
import { HttpError, makeCtx, type Handler } from "@/lib/local/core";
import { authRoutes } from "@/lib/local/auth";
import { usersRoutes } from "@/lib/local/users";
import { testsRoutes } from "@/lib/local/tests";
import { attemptRoutes } from "@/lib/local/attempts";
import { contentRoutes } from "@/lib/local/content";
import { analyticsRoutes } from "@/lib/local/analytics";
import { aiRoutes } from "@/lib/local/ai";

export type LocalRequest = {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

export type LocalResponse = {
  status: number;
  data?: unknown;
  error?: { message: string; code: string; details?: unknown };
};

const routes: Record<string, Handler> = {
  ...authRoutes,
  ...usersRoutes,
  ...testsRoutes,
  ...attemptRoutes,
  ...contentRoutes,
  ...analyticsRoutes,
  ...aiRoutes,
};

type Match = { handler: Handler; params: Record<string, string> };

function matchRoute(method: string, path: string): Match | null {
  const segments = path.split("/").filter(Boolean);
  let paramMatch: Match | null = null;

  for (const key of Object.keys(routes)) {
    const sep = key.indexOf(" ");
    const routeMethod = key.slice(0, sep);
    if (routeMethod !== method) continue;
    const pattern = key.slice(sep + 1).split("/").filter(Boolean);
    if (pattern.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let isParam = false;
    let ok = true;

    for (let i = 0; i < pattern.length; i += 1) {
      const p = pattern[i];
      if (p.startsWith(":")) {
        params[p.slice(1)] = decodeURIComponent(segments[i]);
        isParam = true;
      } else if (p !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    if (!isParam) return { handler: routes[key], params };
    if (!paramMatch) paramMatch = { handler: routes[key], params };
  }
  return paramMatch;
}

function errorStatus(err: unknown): number {
  const anyErr = err as { status?: number; statusCode?: number };
  return typeof anyErr?.status === "number"
    ? anyErr.status
    : typeof anyErr?.statusCode === "number"
      ? anyErr.statusCode
      : 500;
}

/** Runs one API call fully in-process and returns a fetch-like response. */
export async function handleLocal(req: LocalRequest): Promise<LocalResponse> {
  const path = req.path.replace(/^\/api/, "").split("?")[0];
  const method = req.method.toUpperCase();

  try {
    const match = matchRoute(method, path);
    if (!match) {
      return {
        status: 404,
        error: { message: `Cannot ${method} ${path}`, code: "NOT_FOUND" },
      };
    }

    const db = loadDb();
    let user = findUser(db, db.sessionUserId);
    if (user && (user.deletedAt || user.status !== "ACTIVE")) user = undefined;

    const ctx = makeCtx(db, user, match.params, req.query ?? {}, req.body);
    const data = await match.handler(ctx);
    return { status: 200, data };
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        status: err.status,
        error: { message: err.message, code: err.code, details: err.details },
      };
    }
    const status = errorStatus(err);
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    const code = (err as { code?: string })?.code ?? (status === 500 ? "INTERNAL_ERROR" : "ERROR");
    const details = (err as { details?: unknown })?.details;
    if (status === 500 && import.meta.env.DEV) {
      console.error("[local-api]", err);
    }
    return { status, error: { message, code, details } };
  }
}
