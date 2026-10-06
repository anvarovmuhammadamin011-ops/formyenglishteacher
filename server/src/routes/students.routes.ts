import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getBody, getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate, requireTeacher } from "../middleware/auth";
import * as studentService from "../services/student.service";

const levelEnum = z.enum(["BEGINNER", "ELEMENTARY", "PRE_INTERMEDIATE", "INTERMEDIATE", "UPPER_INTERMEDIATE", "ADVANCED"]);

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  groupId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  level: levelEnum.optional(),
  sort: z.enum(["name", "recent", "streak"]).default("name"),
});

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, dots, dashes and underscores are allowed"),
  password: z.string().min(6).max(72),
  age: z.coerce.number().int().min(5).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  groupId: z.string().optional(),
  level: levelEnum.optional(),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  age: z.coerce.number().int().min(5).max(100).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  level: levelEnum.optional(),
  groupId: z.string().nullable().optional(),
});

const passwordSchema = z.object({ password: z.string().min(6).max(72) });
const groupSchema = z.object({ groupId: z.string().nullable() });

export const studentsRouter = Router();
studentsRouter.use(authenticate);
studentsRouter.use(requireTeacher);

studentsRouter.get(
  "/",
  validate({ query: listQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof listQuery>>(req);
    const { items, total } = await studentService.listStudents(q);
    return okList(res, items, total, q.page, q.limit);
  }),
);

studentsRouter.get(
  "/options",
  h(async (_req, res) => {
    const { items } = await studentService.listStudents({ page: 1, limit: 100, sort: "name" });
    return ok(
      res,
      items.map((s) => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName}`,
        group: s.group,
        status: s.status,
      })),
    );
  }),
);

studentsRouter.post(
  "/",
  validate({ body: createSchema }),
  h(async (req, res) => {
    const student = await studentService.createStudent(getBody(req));
    return ok(res, student, 201);
  }),
);

studentsRouter.get(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const student = await studentService.getStudent(getParams<{ id: string }>(req).id);
    return ok(res, student);
  }),
);

studentsRouter.patch(
  "/:id",
  validate({ params: idParam, body: updateSchema }),
  h(async (req, res) => {
    const student = await studentService.updateStudent(getParams<{ id: string }>(req).id, getBody(req));
    return ok(res, student);
  }),
);

studentsRouter.post(
  "/:id/status",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await studentService.deactivateStudent(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

studentsRouter.post(
  "/:id/password",
  validate({ params: idParam, body: passwordSchema }),
  h(async (req, res) => {
    const result = await studentService.resetStudentPassword(
      getParams<{ id: string }>(req).id,
      getBody<{ password: string }>(req).password,
    );
    return ok(res, result);
  }),
);

studentsRouter.post(
  "/:id/group",
  validate({ params: idParam, body: groupSchema }),
  h(async (req, res) => {
    const { groupId } = getBody<{ groupId: string | null }>(req);
    const result = await studentService.moveStudentToGroup(getParams<{ id: string }>(req).id, groupId);
    return ok(res, result);
  }),
);

studentsRouter.delete(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await studentService.deleteStudent(getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);
