import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import type { UserRole } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const SALT_ROUNDS = 12;
const VALID_ROLES: UserRole[] = ["admin", "editor", "viewer"];

router.get("/users", async (_req, res, next) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .orderBy(usersTable.id);

    res.json(users);
  } catch (err) { next(err); }
});

router.post("/users", async (req, res, next) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: "Invalid role. Must be admin, editor, or viewer" });
      return;
    }
    const userRole: UserRole = role || "viewer";

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.toLowerCase().trim()));

    if (existing.length > 0) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const inserted = await db
      .insert(usersTable)
      .values({
        username: username.toLowerCase().trim(),
        passwordHash,
        role: userRole,
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });

    res.status(201).json(inserted[0]);
  } catch (err) { next(err); }
});

router.put("/users/:id", async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (existing.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) {
        res.status(400).json({ error: "Invalid role. Must be admin, editor, or viewer" });
        return;
      }
      updates.role = req.body.role;
    }

    if (req.body.password !== undefined) {
      if (typeof req.body.password !== "string" || req.body.password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }
      updates.passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    }

    const updated = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });

    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    if (req.user && req.user.userId === userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (existing.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
