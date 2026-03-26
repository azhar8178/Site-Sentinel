import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import sitesRouter from "./sites";
import alertsRouter from "./alerts";
import configRouter from "./config";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(requireAuth);
router.use(sitesRouter);
router.use(alertsRouter);
router.use(configRouter);

export default router;
