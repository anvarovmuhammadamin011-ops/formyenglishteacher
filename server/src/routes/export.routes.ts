import { Router } from "express";
import { z } from "zod";
import { h } from "../lib/errors";
import { getParams, idParam, validate } from "../middleware/validate";
import { authenticate, requireRole } from "../middleware/auth";
import * as exportService from "../services/export.service";

export const exportsRouter = Router();
exportsRouter.use(authenticate);
exportsRouter.use(requireRole("TEACHER"));

exportsRouter.get(
  "/students.xlsx",
  h(async (_req, res) => {
    const buffer = await exportService.studentsWorkbook(res);
    return res.send(buffer);
  }),
);

exportsRouter.get(
  "/tests/:id/results.xlsx",
  validate({ params: idParam }),
  h(async (req, res) => {
    const buffer = await exportService.testResultsWorkbook(res, getParams<{ id: string }>(req).id);
    return res.send(buffer);
  }),
);

/** Students may export their own report; teachers may export any. */
export const reportRouter = Router();
reportRouter.use(authenticate);

reportRouter.get(
  "/attempts/:id/report.pdf",
  validate({ params: idParam }),
  h(async (req, res) => {
    const buffer = await exportService.attemptReportPdf(res, getParams<{ id: string }>(req).id, req.user!);
    return res.send(buffer);
  }),
);
