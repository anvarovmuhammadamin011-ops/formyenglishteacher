import { Router } from "express";
import { z } from "zod";
import { h, ok, okList } from "../lib/errors";
import { getParams, getQuery, idParam, paginationSchema, validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import * as service from "../services/notification.service";

const listQuery = paginationSchema.extend({
  unread: z.enum(["true", "false"]).default("false"),
});

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  validate({ query: listQuery }),
  h(async (req, res) => {
    const q = getQuery<z.infer<typeof listQuery>>(req);
    const { items, total, unread } = await service.listNotifications(req.user!.id, {
      page: q.page,
      limit: q.limit,
      unreadOnly: q.unread === "true",
    });
    res.setHeader("X-Unread-Count", String(unread));
    return okList(res, items, total, q.page, q.limit);
  }),
);

notificationsRouter.get(
  "/unread-count",
  h(async (req, res) => {
    const count = await service.unreadCount(req.user!.id);
    return ok(res, { count });
  }),
);

notificationsRouter.post(
  "/read-all",
  h(async (req, res) => {
    const result = await service.markAllRead(req.user!.id);
    return ok(res, result);
  }),
);

notificationsRouter.post(
  "/:id/read",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await service.markRead(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);

notificationsRouter.delete(
  "/:id",
  validate({ params: idParam }),
  h(async (req, res) => {
    const result = await service.remove(req.user!.id, getParams<{ id: string }>(req).id);
    return ok(res, result);
  }),
);
