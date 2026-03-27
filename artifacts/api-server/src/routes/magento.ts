import { Router, type IRouter } from "express";
import {
  getOrderStats,
  getRecentOrders,
  getAbandonedCarts,
  getLastSyncStatus,
} from "../services/magento";

const router: IRouter = Router();

router.get("/magento/stats", async (_req, res, next) => {
  try {
    const stats = await getOrderStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/orders", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const orders = await getRecentOrders(limit);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/carts", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const carts = await getAbandonedCarts(limit);
    res.json(carts);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/sync", async (_req, res, next) => {
  try {
    const logs = await getLastSyncStatus();
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
