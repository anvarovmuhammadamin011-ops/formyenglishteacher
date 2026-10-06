import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getBody, getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate, requireTeacher } from "../middleware/auth";
import * as testService from "../services/test.service";
import { assignSchema, createTestSchema, updateTestSchema } from "../validators/test.validator";

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  skill: z.enum(["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING"]).optional(),
  type: z.enum(["MANUAL", "AI"]).optional(),
  groupId: z.string().optional(),
});

const resultsQuery = z.object({ groupId: z.string().optional() });

const assignmentListQuery = paginationSchema.extend({
  groupId: z.string().optional(),
  testId: z.string().optional(),
  upcoming: z.coerce.boolean().optional(),
});

export const testsRouter = Router();
testsRouter.use(authenticate);
testsRouter.use(requireTeacher);

testsRouter.get(
  "/",
  validate({ query: listQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof listQuery>>(req);
    const { items, total } = await testService.listTests(q);
    return okList(res, items, total, q.page, q.limit);
  }),
);

testsRouter.post(
  "/",
  validate({ body: createTestSchema }),
  h(async (req, res) => {
    const test = await testService.createTest(getBody(req), req.user!.id);
    return ok(res, test, 201);
  }),
);

testsRouter.get(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const test = await testService.getTest(getParams<{ id: string }>(req).id);
    return ok(res, test);
  }),
);

testsRouter.patch(
  "/:id",
  validate({ params: idParam, body: updateTestSchema }),
  h(async (req, res) => {
    const test = await testService.updateTest(getParams<{ id: string }>(req).id, getBody(req));
    return ok(res, test);
  }),
);

testsRouter.delete(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await testService.deleteTest(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

testsRouter.post(
  "/:id/assign",
  validate({ params: idParam, body: assignSchema }),
  h(async (req, res) => {
    const result = await testService.assignTest(
      getParams<{ id: string }>(req).id,
      getBody<z.infer<typeof assignSchema>>(req),
      req.user!.id,
    );
    return ok(res, result, 201);
  }),
);

testsRouter.delete(
  "/:id/assignments/:groupId",
  h(async (req, res) => {
    const result = await testService.unassignTest(String(req.params.id), String(req.params.groupId));
    return ok(res, result);
  }),
);

testsRouter.get(
  "/:id/results",
  validate({ params: idParam, query: resultsQuery }),
  h(async (req, res) => {
    const q = getQuery<{ groupId?: string }>(req);
    const result = await testService.getTestResults(getParams<{ id: string }>(req).id, q);
    return ok(res, result);
  }),
);

export const assignmentsRouter = Router();
assignmentsRouter.use(authenticate);
assignmentsRouter.use(requireTeacher);

assignmentsRouter.get(
  "/",
  validate({ query: assignmentListQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof assignmentListQuery>>(req);
    const { items, total } = await testService.listAssignments(q);
    return okList(res, items, total, q.page, q.limit);
  }),
);
