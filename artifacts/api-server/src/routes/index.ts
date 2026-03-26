import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sitesRouter from "./sites";
import alertsRouter from "./alerts";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sitesRouter);
router.use(alertsRouter);
router.use(configRouter);

export default router;
