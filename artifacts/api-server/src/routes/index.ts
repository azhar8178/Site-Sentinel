import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import sitesRouter from "./sites";
import alertsRouter from "./alerts";
import configRouter from "./config";
import { serversRouter, reportRouter } from "./servers";
import agentUpdateRouter from "./agent-update";
import magentoRouter from "./magento";
import usersRouter from "./users";
import { requireAuth, requireRole } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(reportRouter);
router.use(agentUpdateRouter);

router.use(requireAuth);

router.use(sitesRouter);
router.use(alertsRouter);
router.use(magentoRouter);
router.use(serversRouter);

router.use("/", requireRole("editor", "admin"), configRouter);

router.use("/", requireRole("admin"), usersRouter);

export default router;
