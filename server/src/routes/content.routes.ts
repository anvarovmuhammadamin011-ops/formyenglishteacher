import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getBody, getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate, requireTeacher } from "../middleware/auth";
import * as service from "../services/content.service";

const levelEnum = z.enum(["BEGINNER", "ELEMENTARY", "PRE_INTERMEDIATE", "INTERMEDIATE", "UPPER_INTERMEDIATE", "ADVANCED"]);
const questionSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctAnswer: z.string().min(1),
  points: z.number().int().min(1).optional(),
});

// ───────────────────────── Vocabulary ─────────────────────────

export const vocabularyRouter = Router();
vocabularyRouter.use(authenticate);

vocabularyRouter.get(
  "/categories",
  h(async (_req, res) => ok(res, await service.vocabularyCategories())),
);

vocabularyRouter.get(
  "/stats",
  h(async (req, res) => ok(res, await service.vocabularyStats(req.user!.id))),
);

vocabularyRouter.get(
  "/",
  validate({
    query: paginationSchema.extend({
      search: z.string().trim().max(120).optional(),
      level: levelEnum.optional(),
      category: z.string().max(80).optional(),
      status: z.enum(["NEW", "LEARNING", "LEARNED"]).optional(),
    }),
  }),
  h(async (req, res) => {
    const q = getQuery<Parameters<typeof service.listVocabulary>[1]>(req);
    const { items, total } = await service.listVocabulary(req.user!.id, q);
    return okList(res, items, total, q.page, q.limit);
  }),
);

const practiceSchema = z.object({ correct: z.boolean() });

vocabularyRouter.post(
  "/:id/practice",
  validate({ params: idParam, body: practiceSchema }),
  h(async (req, res) => {
    const { correct } = getBody<{ correct: boolean }>(req);
    const result = await service.practiceVocabulary(req.user!.id, getParams<{ id: string }>(req).id, correct);
    return ok(res, result);
  }),
);

const createWordSchema = z.object({
  word: z.string().trim().min(1).max(80),
  uzbek: z.string().trim().min(1).max(200),
  russian: z.string().trim().max(200).optional(),
  example: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  level: levelEnum,
});

vocabularyRouter.post("/", requireTeacher, validate({ body: createWordSchema }), h(async (req, res) => {
  const created = await service.createVocabulary(req.user!.id, getBody(req));
  return ok(res, created, 201);
}));

vocabularyRouter.patch(
  "/:id",
  requireTeacher,
  validate({ params: idParam, body: createWordSchema.partial() }),
  h(async (req, res) => ok(res, await service.updateVocabulary(getParams<{ id: string }>(req).id, getBody(req)))),
);

vocabularyRouter.delete(
  "/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await service.deleteVocabulary(getParams<{ id: string }>(req).id))),
);

// ───────────────── Reading & Listening (factory) ─────────────────

const materialListQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  level: levelEnum.optional(),
});

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0).optional(),
        answerText: z.string().optional(),
      }),
    )
    .max(100),
  durationSeconds: z.number().int().min(0).max(7200).optional(),
});

function buildMaterialRouter(kind: "reading" | "listening") {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    validate({ query: materialListQuery }),
    h(async (req, res) => {
      const q = getQuery<Parameters<typeof service.listMaterials>[3]>(req);
      const { items, total } = await service.listMaterials(kind, req.user!.id, req.user!.role, q);
      return okList(res, items, total, q.page, q.limit);
    }),
  );

  router.post(
    "/",
    requireTeacher,
    validate({
      body: z.object({
        title: z.string().trim().min(1).max(200),
        level: levelEnum,
        topic: z.string().trim().max(120).optional(),
        estimatedMinutes: z.number().int().min(1).max(120).optional(),
        status: z.enum(["DRAFT", "PUBLISHED"]),
        text: z.string().optional(),
        audioUrl: z.string().optional(),
        transcript: z.string().optional(),
        questions: z.array(questionSchema).max(50).optional(),
      }),
    }),
    h(async (req, res) => {
      const created = await service.createMaterial(kind, req.user!.id, getBody(req));
      return ok(res, created, 201);
    }),
  );

  router.get(
    "/:id",
    validate({ params: idParam }),
    h(async (req, res) => ok(res, await service.getMaterial(kind, getParams<{ id: string }>(req).id, req.user!))),
  );

  router.patch(
    "/:id",
    requireTeacher,
    validate({
      params: idParam,
      body: z.object({
        title: z.string().trim().min(1).max(200).optional(),
        level: levelEnum.optional(),
        topic: z.string().trim().max(120).nullable().optional(),
        estimatedMinutes: z.number().int().min(1).max(120).optional(),
        status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
        text: z.string().optional(),
        audioUrl: z.string().optional(),
        transcript: z.string().nullable().optional(),
      }),
    }),
    h(async (req, res) => ok(res, await service.updateMaterial(kind, getParams<{ id: string }>(req).id, getBody(req)))),
  );

  router.delete(
    "/:id",
    requireTeacher,
    validate({ params: idParam }),
    h(async (req, res) => ok(res, await service.deleteMaterial(kind, getParams<{ id: string }>(req).id))),
  );

  router.post(
    "/:id/attempts",
    validate({ params: idParam, body: submitSchema }),
    h(async (req, res) => {
      const result = await service.submitMaterial(kind, getParams<{ id: string }>(req).id, req.user!, getBody(req));
      return ok(res, result, 201);
    }),
  );

  router.get(
    "/:id/attempts",
    requireTeacher,
    validate({ params: idParam }),
    h(async (req, res) => ok(res, await service.materialAttempts(kind, getParams<{ id: string }>(req).id))),
  );

  return router;
}

export const readingRouter = buildMaterialRouter("reading");
export const listeningRouter = buildMaterialRouter("listening");

// ───────────────────────── Writing ─────────────────────────

export const writingRouter = Router();
writingRouter.use(authenticate);

writingRouter.get(
  "/",
  validate({ query: paginationSchema }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof paginationSchema>>(req);
    const { items, total } = await service.listWriting(req.user!.id, req.user!.role, q);
    return okList(res, items, total, q.page, q.limit);
  }),
);

writingRouter.post(
  "/",
  requireTeacher,
  validate({
    body: z.object({
      title: z.string().trim().min(1).max(200),
      instructions: z.string().trim().min(1).max(3000),
      minWords: z.number().int().min(10).max(2000).optional(),
      maxWords: z.number().int().min(50).max(5000).optional(),
      level: levelEnum,
      topic: z.string().trim().max(300).optional(),
      dueAt: z.string().datetime({ offset: true }).nullable().optional(),
      status: z.enum(["DRAFT", "PUBLISHED"]),
    }),
  }),
  h(async (req, res) => ok(res, await service.createWriting(req.user!.id, getBody(req)), 201)),
);

writingRouter.get(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await service.getWriting(getParams<{ id: string }>(req).id, req.user!))),
);

writingRouter.patch(
  "/:id",
  requireTeacher,
  validate({
    params: idParam,
    body: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      instructions: z.string().trim().min(1).max(3000).optional(),
      minWords: z.number().int().min(10).max(2000).optional(),
      maxWords: z.number().int().min(50).max(5000).optional(),
      level: levelEnum.optional(),
      topic: z.string().trim().max(300).nullable().optional(),
      dueAt: z.string().datetime({ offset: true }).nullable().optional(),
      status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    }),
  }),
  h(async (req, res) => ok(res, await service.updateWriting(getParams<{ id: string }>(req).id, getBody(req)))),
);

writingRouter.delete(
  "/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await service.deleteWriting(getParams<{ id: string }>(req).id))),
);

writingRouter.post(
  "/:id/submit",
  validate({ params: idParam, body: z.object({ text: z.string().min(1).max(20000) }) }),
  h(async (req, res) => {
    const { text } = getBody<{ text: string }>(req);
    const result = await service.submitWriting(req.user!.id, getParams<{ id: string }>(req).id, text);
    return ok(res, result, 201);
  }),
);

writingRouter.get(
  "/:id/submissions",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await service.listSubmissions(getParams<{ id: string }>(req).id))),
);

writingRouter.post(
  "/submissions/:id/grade",
  requireTeacher,
  validate({
    params: idParam,
    body: z.object({
      score: z.number().int().min(0).max(100),
      feedback: z.string().trim().min(1).max(5000),
    }),
  }),
  h(async (req, res) => {
    const { score, feedback } = getBody<{ score: number; feedback: string }>(req);
    const result = await service.gradeSubmission(req.user!.id, getParams<{ id: string }>(req).id, score, feedback);
    return ok(res, result);
  }),
);
