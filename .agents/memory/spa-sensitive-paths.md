---
name: SPA sensitive paths
description: Security boundary for Express servers that serve a dashboard fallback
---

When an Express API serves a single-page dashboard fallback, reject dotfiles and configuration-like paths before static serving and before the catch-all route. Otherwise probes such as `GET /.env` can receive a misleading HTTP 200 containing the SPA shell and obscure whether sensitive files are protected.

**Why:** The production request log showed `GET /.env` returning 200 because the catch-all dashboard route handled the unknown path.

**How to apply:** Keep the sensitive-path deny middleware ahead of `express.static` and the SPA fallback, and verify both `/api/healthz` remains 200 and `/.env` returns 404 after deployment.