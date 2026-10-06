import type { RequestHandler } from "express";
import { z } from "zod";

type Source = "body" | "query" | "params";

/**
 * Validates the request against the given schemas and stores the parsed data
 * on `req.validated`. Never trusts raw client input downstream.
 */
export function validate(schemas: Partial<Record<Source, z.ZodType>>): RequestHandler {
  return (req, _res, next) => {
    const result: Record<string, unknown> = {};
    try {
      for (const source of ["body", "query", "params"] as Source[]) {
        const schema = schemas[source];
        if (!schema) continue;
        const raw = source === "query" ? { ...req.query } : source === "params" ? { ...req.params } : req.body ?? {};
        result[source] = schema.parse(raw);
      }
      req.validated = result as never;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function body<T extends z.ZodType>(schema: T): RequestHandler {
  return validate({ body: schema });
}

export function query<T extends z.ZodType>(schema: T): RequestHandler {
  return validate({ query: schema });
}

export function getBody<T = unknown>(req: Parameters<RequestHandler>[0]): T {
  return (req.validated?.body ?? req.body) as T;
}

export function getQuery<T = unknown>(req: Parameters<RequestHandler>[0]): T {
  return (req.validated?.query ?? req.query) as T;
}

export function getParams<T = unknown>(req: Parameters<RequestHandler>[0]): T {
  return (req.validated?.params ?? req.params) as T;
}

// ── shared primitives ─────────────────────────────────────────────

export const idParam = z.object({ id: z.string().min(1) });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const dateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
