import { Router } from "express";
import { z } from "zod";
import { h, ok } from "../lib/errors";
import { getParams, getQuery, idParam, validate } from "../middleware/validate";
import { authenticate, requireRole } from "../middleware/auth";
import * as service from "../services/analytics.service";

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

analyticsRouter.get(
  "/dashboard",
  requireRole("TEACHER"),
  h(async (_req, res) => {
    const result = await service.teacherDashboard();
    return ok(res, result);
  }),
);

analyticsRouter.get(
  "/me",
  requireRole("STUDENT"),
  h(async (req, res) => {
    const result = await service.studentDashboard(req.user!.id);
    return ok(res, result);
  }),
);

analyticsRouter.get(
  "/rankings",
  validate({
    query: z.object({
      groupId: z.string().optional(),
      period: z.enum(["all", "7d", "30d", "90d"]).default("30d"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  h(async (req, res) => {
    const q = getQuery<{ groupId?: string; period: service.Period; limit: number }>(req);
    const items = await service.rankings(q);
    return ok(res, items);
  }),
);

analyticsRouter.get(
  "/students/:id",
  requireRole("TEACHER"),
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await service.studentDetail(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

analyticsRouter.get(
  "/groups/:id",
  requireRole("TEACHER"),
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await service.groupDetail(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

const calendarQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

analyticsRouter.get(
  "/calendar",
  validate({ query: calendarQuery }),
  h(async (req, res) => {
    const q = getQuery<{ from?: string; to?: string }>(req);
    const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date();
    const to = q.to ? new Date(`${q.to}T23:59:59`) : new Date(Date.now() + 30 * 86_400_000);
    const events = await service.calendar(req.user!, from, to);
    return ok(res, events);
  }),
);
