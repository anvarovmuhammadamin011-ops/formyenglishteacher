import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getBody, getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate, requireRole } from "../middleware/auth";
import * as attemptService from "../services/attempt.service";
import { attemptEventSchema, saveAnswerSchema } from "../validators/test.validator";

const historyQuery = paginationSchema.extend({
  status: z.enum(["SUBMITTED", "TIME_UP", "IN_PROGRESS"]).optional(),
});

const startSchema = z.object({ assignmentId: z.string().min(1) });
const submitSchema = z.object({ auto: z.boolean().default(false) });

export const attemptsRouter = Router();
attemptsRouter.use(authenticate);

// Student-facing lists (registered before /:id)
attemptsRouter.get(
  "/assigned",
  requireRole("STUDENT"),
  h(async (req, res) => {
    const items = await attemptService.listAssigned(req.user!.id);
    return ok(res, items);
  }),
);

attemptsRouter.get(
  "/mine",
  requireRole("STUDENT"),
  validate({ query: historyQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof historyQuery>>(req);
    const { items, total } = await attemptService.listMyAttempts(req.user!.id, q);
    return okList(res, items, total, q.page, q.limit);
  }),
);

attemptsRouter.post(
  "/start",
  requireRole("STUDENT"),
  validate({ body: startSchema }),
  h(async (req, res) => {
    const { assignmentId } = getBody<{ assignmentId: string }>(req);
    const attempt = await attemptService.startAttempt(req.user!.id, assignmentId);
    return ok(res, attempt, 201);
  }),
);

attemptsRouter.get(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const attempt = await attemptService.getAttempt(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, attempt);
  }),
);

attemptsRouter.post(
  "/:id/answer",
  requireRole("STUDENT"),
  validate({ params: idParam, body: saveAnswerSchema }),
  h(async (req, res) => {
    const result = await attemptService.saveAnswer(
      req.user!.id,
      getParams<{ id: string }>(req).id,
      getBody<Parameters<typeof attemptService.saveAnswer>[2]>(req),
    );
    return ok(res, result);
  }),
);

attemptsRouter.post(
  "/:id/submit",
  requireRole("STUDENT"),
  validate({ params: idParam, body: submitSchema }),
  h(async (req, res) => {
    const { auto } = getBody<{ auto: boolean }>(req);
    const result = await attemptService.submitAttempt(req.user!.id, getParams<{ id: string }>(req).id, auto);
    return ok(res, result);
  }),
);

attemptsRouter.post(
  "/:id/event",
  requireRole("STUDENT"),
  validate({ params: idParam, body: attemptEventSchema }),
  h(async (req, res) => {
    const { type } = getBody<{ type: "TAB_BLUR" | "PAGE_REFRESH" | "VISIBILITY" }>(req);
    const result = await attemptService.recordEvent(req.user!.id, getParams<{ id: string }>(req).id, type);
    return ok(res, result);
  }),
);

// Result detail — owner (student) or teacher (review).
attemptsRouter.get(
  "/:id/result",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await attemptService.getStudentResult(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);
