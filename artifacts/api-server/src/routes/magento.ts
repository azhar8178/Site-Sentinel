import { Router, type IRouter } from "express";
import {
  getOrderStats,
  getOrderStatsByStore,
  getRecentOrders,
  getAbandonedCarts,
  getLastSyncStatus,
} from "../services/magento";

const router: IRouter = Router();

router.get("/magento/stats", async (req, res, next) => {
  try {
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const stats = await getOrderStats(storeId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/stats/by-store", async (_req, res, next) => {
  try {
    const stats = await getOrderStatsByStore();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/orders", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const orders = await getRecentOrders(limit, storeId);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

router.get("/magento/carts", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const carts = await getAbandonedCarts(limit, storeId);
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
