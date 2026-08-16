import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Agent reports include bounded multi-source log snapshots. Keep the limit
// conservative, but above Express's 100 KB default so those reports can be
// accepted without requiring the agent to omit diagnostics.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Older agents may retain a trailing slash in MONITOR_API_URL and request
// paths such as //api/servers/report. Normalize that harmlessly before the
// API router so those agents can self-update instead of receiving the SPA.
app.use((req, _res, next) => {
  if (req.url.startsWith("//api/")) {
    req.url = req.url.slice(1);
  }
  next();
});

app.use("/api", router);

const webDistPath = resolve(process.cwd(), "artifacts", "web-dashboard", "dist");

if (existsSync(webDistPath)) {
  logger.info({ webDistPath }, "Serving web dashboard");
  app.use((req, res, next) => {
    const requestPath = req.path;
    const isSensitivePath =
      /(^|\/)\.(?:env|git|svn|hg)(?:$|\/)/i.test(requestPath) ||
      /\.(?:env|ini|conf|config|log|sql|bak|old|swp)$/i.test(requestPath);

    if (isSensitivePath) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    next();
  });
  app.use(express.static(webDistPath, { dotfiles: "deny" }));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(resolve(webDistPath, "index.html"));
  });
}

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  req.log?.error({ err }, "Unhandled request error");
  if (req.path.startsWith("/api")) {
    res.status(500).json({ error: "The request could not be completed." });
    return;
  }

  next(err);
});

export default app;
