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
app.use(express.json());
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
  app.use(express.static(webDistPath));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(resolve(webDistPath, "index.html"));
  });
}

export default app;
