import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.length === 64 && !hash.startsWith("$2")) {
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(password).digest("hex");
    return sha256 === hash;
  }
  return bcrypt.compare(password, hash);
}

router.post("/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.toLowerCase().trim()));

    if (users.length === 0) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const user = users[0];
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    if (user.passwordHash.length === 64 && !user.passwordHash.startsWith("$2")) {
      const newHash = await hashPassword(password);
      await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
    }

    const token = signToken({ userId: user.id, username: user.username });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) { next(err); }
});

router.post("/auth/register", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const totalUsers = await db.select({ total: count() }).from(usersTable);
    const isFirstUser = (totalUsers[0]?.total ?? 0) === 0;

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.toLowerCase().trim()));

    if (existing.length > 0) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }

    if (!isFirstUser) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(403).json({ error: "Only existing users can create new accounts" });
        return;
      }

      const jwt = await import("jsonwebtoken");
      const jwtSecret = process.env["JWT_SECRET"];
      if (!jwtSecret) {
        res.status(500).json({ error: "Server configuration error" });
        return;
      }
      try {
        const payload = jwt.default.verify(authHeader.slice(7), jwtSecret) as { userId: number };
        const adminCheck = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
        if (adminCheck.length === 0) {
          res.status(403).json({ error: "Only existing users can create new accounts" });
          return;
        }
      } catch {
        res.status(403).json({ error: "Only existing users can create new accounts" });
        return;
      }
    }

    const inserted = await db
      .insert(usersTable)
      .values({
        username: username.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
        isAdmin: isFirstUser,
      })
      .returning();

    const user = inserted[0];
    const token = signToken({ userId: user.id, username: user.username });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) { next(err); }
});

router.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));

    if (users.length === 0) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const user = users[0];
    res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    });
  } catch (err) { next(err); }
});

router.get("/auth/user-count", async (_req, res, next) => {
  try {
    const result = await db.select({ total: count() }).from(usersTable);
    res.json({ count: result[0]?.total ?? 0 });
  } catch (err) { next(err); }
});

export default router;
