import { Router } from "express";
import { z } from "zod";
import { h, ok } from "../lib/errors";
import { getBody, getParams, idParam, validate } from "../middleware/validate";
import { authenticate, requireTeacher } from "../middleware/auth";
import * as aiService from "../services/ai.service";

const levelEnum = z.enum(["BEGINNER", "ELEMENTARY", "PRE_INTERMEDIATE", "INTERMEDIATE", "UPPER_INTERMEDIATE", "ADVANCED"]);
const skillEnum = z.enum(["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"]);

export const aiRouter = Router();
aiRouter.use(authenticate);

aiRouter.get(
  "/status",
  h(async (_req, res) => ok(res, aiService.aiStatus())),
);

aiRouter.get(
  "/requests",
  validate({ query: z.object({ type: z.string().optional() }) }),
  h(async (req, res) => {
    const type = (req.query.type as never) || undefined;
    const { items, total } = await aiService.listRequests(req.user!.id, type);
    return ok(res, { items, total });
  }),
);

const generateSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  skill: skillEnum,
  level: levelEnum,
  questionCount: z.coerce.number().int().min(3).max(30),
  title: z.string().trim().max(200).optional(),
  types: z
    .array(z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"]))
    .min(1)
    .optional(),
});

aiRouter.post(
  "/generate-test",
  requireTeacher,
  validate({ body: generateSchema }),
  h(async (req, res) => {
    const test = await aiService.generateTest(req.user!.id, getBody<z.infer<typeof generateSchema>>(req));
    return ok(res, test, 201);
  }),
);

aiRouter.post(
  "/regenerate-question/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => {
    const question = await aiService.regenerateQuestion(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, question);
  }),
);

aiRouter.post(
  "/analyze-writing",
  requireTeacher,
  validate({
    body: z.object({
      text: z.string().min(1).max(20000),
      instructions: z.string().max(3000).optional(),
      minWords: z.number().int().min(10).optional(),
      maxWords: z.number().int().max(5000).optional(),
    }),
  }),
  h(async (req, res) => {
    const result = await aiService.analyzeWriting(req.user!.id, getBody(req));
    return ok(res, result);
  }),
);

aiRouter.post(
  "/analyze-student/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await aiService.analyzeStudent(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

aiRouter.post(
  "/analyze-group/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await aiService.analyzeGroup(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);
