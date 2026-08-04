---
name: Production deploy recovery
description: Self-hosted deployments may need the compose DATABASE_URL for schema push and a separate host-agent restart
---

For the self-hosted Docker deployment, building and recreating the API container does not apply database schema changes or update the host monitoring agent. The host checkout's pnpm install can also fail when node_modules contains root-owned entries.

**Why:** The API image has its own dependency installation, while schema tooling runs from the host checkout and the monitor agent runs as a separate systemd service.

**How to apply:** Extract DATABASE_URL from the running API container for the schema push, avoid repeating a failed host install unless ownership is repaired, and update/restart `/opt/monitor-agent` separately.

If a production `drizzle-kit push` is interrupted or left running, it can hold `AccessExclusiveLock` on `servers` or `server_metrics` and queue every API report behind it. Terminate only the stale migration sessions, then apply the intended additive SQL directly.