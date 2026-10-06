import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getBody, getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate, requireTeacher } from "../middleware/auth";
import * as groupService from "../services/group.service";

const levelEnum = z.enum(["BEGINNER", "ELEMENTARY", "PRE_INTERMEDIATE", "INTERMEDIATE", "UPPER_INTERMEDIATE", "ADVANCED"]);

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  stats: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: levelEnum,
  description: z.string().trim().max(500).optional(),
  studentIds: z.array(z.string()).max(100).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  level: levelEnum.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

const memberSchema = z.object({ studentId: z.string().min(1) });

export const groupsRouter = Router();
groupsRouter.use(authenticate);

groupsRouter.get(
  "/",
  requireTeacher,
  validate({ query: listQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof listQuery>>(req);
    const { items, total } = await groupService.listGroups({ ...q, includeStats: q.stats });
    return okList(res, items, total, q.page, q.limit);
  }),
);

groupsRouter.get(
  "/options",
  requireTeacher,
  h(async (_req, res) => {
    const options = await groupService.listGroupOptions();
    return ok(res, options);
  }),
);

groupsRouter.post(
  "/",
  requireTeacher,
  validate({ body: createSchema }),
  h(async (req, res) => {
    const group = await groupService.createGroup(getBody(req), req.user!.id);
    return ok(res, group, 201);
  }),
);

groupsRouter.get(
  "/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => {
    const group = await groupService.getGroup(getParams<{ id: string }>(req).id, { includeStats: true });
    return ok(res, group);
  }),
);

groupsRouter.patch(
  "/:id",
  requireTeacher,
  validate({ params: idParam, body: updateSchema }),
  h(async (req, res) => {
    const group = await groupService.updateGroup(getParams<{ id: string }>(req).id, getBody(req));
    return ok(res, group);
  }),
);

groupsRouter.delete(
  "/:id",
  requireTeacher,
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await groupService.deleteGroup(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

groupsRouter.post(
  "/:id/members",
  requireTeacher,
  validate({ params: idParam, body: memberSchema }),
  h(async (req, res) => {
    const { studentId } = getBody<{ studentId: string }>(req);
    const group = await groupService.addStudent(getParams<{ id: string }>(req).id, studentId);
    return ok(res, group, 201);
  }),
);

groupsRouter.delete(
  "/:id/members/:studentId",
  requireTeacher,
  h(async (req, res) => {
    const group = await groupService.removeStudent(String(req.params.id), String(req.params.studentId));
    return ok(res, group);
  }),
);
