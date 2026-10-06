import { Router } from "express";
import { studentsRouter } from "./students.routes";
import { groupsRouter } from "./groups.routes";
import { assignmentsRouter, testsRouter } from "./tests.routes";
import { attemptsRouter } from "./attempts.routes";
import { analyticsRouter } from "./analytics.routes";
import { notificationsRouter } from "./notifications.routes";
import { listeningRouter, readingRouter, vocabularyRouter, writingRouter } from "./content.routes";
import { aiRouter } from "./ai.routes";
import { exportsRouter, reportRouter } from "./export.routes";
import { profileRouter } from "./profile.routes";

export const apiRouter = Router();

apiRouter.use("/students", studentsRouter);
apiRouter.use("/groups", groupsRouter);
apiRouter.use("/tests", testsRouter);
apiRouter.use("/assignments", assignmentsRouter);
apiRouter.use("/attempts", attemptsRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/vocabulary", vocabularyRouter);
apiRouter.use("/reading", readingRouter);
apiRouter.use("/listening", listeningRouter);
apiRouter.use("/writing", writingRouter);
apiRouter.use("/ai", aiRouter);
apiRouter.use("/exports", exportsRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/profile", profileRouter);
