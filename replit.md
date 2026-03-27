# Workspace

## Overview

Site monitoring and alerting system for two Magento e-commerce sites (lovefurniture.ie and lovefurniture.co.uk). The backend checks site availability every 60 seconds, sends email alerts via AWS SES when issues are detected, and a mobile Expo app provides a real-time monitoring dashboard.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native)
- **Email**: Generic SMTP (nodemailer)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server + monitoring worker
│   │   └── src/
│   │       ├── services/
│   │       │   ├── monitor.ts   # Site monitoring worker (60s interval, multi-channel alerts)
│   │       │   ├── magento.ts   # Magento sync service (5m interval, DB-first config)
│   │       │   ├── email.ts     # SMTP email alerts
│   │       │   ├── slack.ts     # Slack webhook notifications
│   │       │   └── whatsapp.ts  # WhatsApp Business API notifications
│   │       └── routes/
│   │           └── index.ts     # All API routes (sites, checks, alerts, config)
│   ├── mobile/              # Expo mobile app (Site Monitor dashboard)
│   │   └── app/
│   │       ├── _layout.tsx      # Root layout with API client setup
│   │       └── (tabs)/
│   │           ├── index.tsx    # Dashboard tab
│   │           ├── history.tsx  # Response time history charts
│   │           ├── store.tsx    # Magento orders & cart tracking
│   │           ├── servers.tsx  # Server vitals (CPU/mem/disk/net)
│   │           ├── alerts.tsx   # Alert log viewer
│   │           └── settings.tsx # Connection management (Magento/Slack/WhatsApp/Email/Thresholds)
│   └── mockup-sandbox/     # Component preview server
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── sites.ts    # sites, check_results, alerts, alert_config (email+slack+whatsapp) tables
│           ├── servers.ts  # servers, server_metrics tables
│           ├── magento.ts  # magento_orders, magento_carts, magento_sync_log, magento_config tables
│           └── users.ts    # users table
├── scripts/
│   └── src/
│       └── seed-sites.ts   # Seeds the two monitored sites + default config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

### Monitoring Worker
- Checks both sites every 60 seconds via HTTP HEAD requests
- Records response time, status code, and up/down state
- Detects status transitions (up→down, down→up, normal→slow)
- Sends email alerts only on state changes (no duplicate alerts)
- Configurable slow threshold per site (default 5000ms)

### Email Alerts (AWS SES)
- Three alert types: site_down, slow_response, recovery
- HTML-formatted emails with site details and timestamps
- Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION secrets
- Configurable sender and recipient emails via Settings tab

### Mobile App (Expo)
- **Dashboard**: Overview of all sites with status badges, response times, manual check button
- **History**: Response time bar charts, site selector, time range filters (1h/6h/24h), uptime stats
- **Alerts**: Chronological alert log with type badges and resolution status
- **Settings**: Toggle email alerts, configure sender/recipients, per-site slow thresholds

### Server Vitals Monitoring
- Lightweight Node.js agent (`agent/monitor-agent.js`) runs on each server
- Reports CPU, memory, disk, network, and load average every 30s
- Agent authenticates via API key (no JWT needed)
- Install via `agent/install.sh` which sets up a systemd service
- Server detail modal shows historical charts (1h/6h/24h)

### Server Vitals Alerting
- Threshold-based alerting for CPU, RAM, disk usage and server offline status
- Default thresholds: CPU > 90%, RAM > 90%, Disk > 95%, offline timeout 5 minutes
- Configurable via Settings tab ("Server Alert Thresholds" section)
- Alert types: `cpu_high`, `ram_high`, `disk_high`, `server_offline`, `server_recovery`
- Alerts fire on state transitions only (no duplicate alerts for sustained conditions)
- Uses same notification channels as site alerts (Email, Slack, WhatsApp)
- In-memory state tracking per server (resets on server restart)
- DB schema: `server_alert_config` table, `alerts.server_id` FK, nullable `alerts.site_id`
- Service: `artifacts/api-server/src/services/serverMonitor.ts`
- API: `GET/PUT /api/config/server-alerts`

### Magento Integration
- Background sync every 5 minutes fetches orders (7 days) and carts (48 hours)
- Paginated fetching handles large stores (100 per page, loops until complete)
- Mutex prevents overlapping sync runs when API is slow
- Cart abandonment: active carts with no update for 1+ hour
- Stats: today's orders/revenue, weekly orders/revenue, active carts, abandoned carts, abandonment rate
- Sync status tracked in `magento_sync_log` table
- Requires `MAGENTO_API_URL` and `MAGENTO_API_TOKEN` environment variables
- API token needs `Magento_Sales::actions_view` and `Magento_Cart::manage` permissions

### API Endpoints
- `GET /api/sites` - List all monitored sites
- `POST /api/sites/:id/check` - Trigger manual site check
- `GET /api/sites/:id/checks` - Get check history for a site
- `GET /api/alerts` - List alerts with pagination
- `GET /api/config` - Get alert configuration
- `PUT /api/config` - Update alert configuration
- `PUT /api/sites/:id/threshold` - Update site slow threshold
- `GET /api/servers` - List servers with latest metrics
- `POST /api/servers` - Register a new server (returns API key)
- `GET /api/servers/:id` - Get server details (includes API key)
- `DELETE /api/servers/:id` - Remove a server
- `GET /api/servers/:id/metrics` - Get historical metrics
- `POST /api/servers/report` - Agent reports metrics (API key auth, no JWT)
- `GET /api/config/server-alerts` - Get server alert thresholds config
- `PUT /api/config/server-alerts` - Update server alert thresholds config
- `GET /api/magento/stats` - Order and cart statistics
- `GET /api/magento/orders` - Recent orders list
- `GET /api/magento/carts` - Abandoned carts list
- `GET /api/magento/sync` - Last sync status/errors
- `GET /api/users` - List all users (admin only)
- `POST /api/users` - Create user with role (admin only)
- `PUT /api/users/:id` - Update role or reset password (admin only)
- `DELETE /api/users/:id` - Remove user (admin only, cannot delete self)

## User Authentication & Role-Based Access Control

Username/password authentication with JWT tokens and role-based permissions:
- Three roles: `admin`, `editor`, `viewer` (stored as `user_role` enum in DB)
- First registered user is auto-admin; subsequent registrations default to viewer
- `requireRole(...roles)` middleware enforces permissions on API routes
- Config/settings routes require `editor` or `admin` role
- User management routes (`/api/users`) require `admin` role
- Data viewing routes (sites, alerts, magento, servers) require any authenticated role
- JWT payload includes `role` field alongside `userId` and `username`
- JWT tokens expire after 7 days
- Auth state persisted via AsyncStorage in mobile app
- Login screen gates access to the main dashboard

### User Management (Admin only)
- `GET /api/users` - List all users with roles
- `POST /api/users` - Create user with role assignment
- `PUT /api/users/:id` - Update role or reset password
- `DELETE /api/users/:id` - Remove user (cannot delete self)
- Team management UI in Settings tab with add/edit/remove controls
- Viewers see read-only dashboards; editors can edit config but not manage users

## Email / SMTP

Email alerts use generic SMTP (nodemailer), not AWS SES. All SMTP settings (host, port, username, password, SSL/TLS) are stored in the `alert_config` database table and configurable from the Settings tab in the app. No environment variables needed for email.

The SMTP password is masked ("••••••••") in API responses. A `/api/config/test-smtp` endpoint lets users verify their SMTP settings from the app before saving.

## Environment Secrets Required

- `JWT_SECRET` - Secret for signing JWT tokens (generate with `openssl rand -hex 32`)
- `MAGENTO_API_URL` - Magento REST API base URL (e.g. `https://www.lovefurniture.ie/rest/V1`)
- `MAGENTO_API_TOKEN` - Magento integration access token (fallback, used if admin credentials unavailable)
- `MAGENTO_ADMIN_USER` - Magento admin username (preferred auth: auto-fetches and refreshes tokens)
- `MAGENTO_ADMIN_PASS` - Magento admin password

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with site monitoring worker. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence. The monitoring worker starts automatically on server boot.

- Entry: `src/index.ts` — reads `PORT`, starts Express, starts monitoring worker
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` — all API routes for sites, checks, alerts, and config
- Services: `src/services/monitor.ts` — site checking worker; `src/services/email.ts` — SES email alerts
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle

### `artifacts/mobile` (`@workspace/mobile`)

Expo React Native app for site monitoring dashboard. Uses generated React Query hooks from `@workspace/api-client-react`.

- Tab-based navigation: Dashboard, History, Store, Servers, Alerts, Settings
- API base URL configured via `EXPO_PUBLIC_DOMAIN` environment variable
- Custom `SimpleChart` component (no native dependencies required)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/schema/sites.ts` — sites, check_results, alerts, alert_config tables
- Production migrations are handled by `artifacts/api-server/scripts/migrate.mjs` which runs during the production build step. It is idempotent and handles schema additions (role enum, server_alert_config table, alerts table alterations) safely.
- In development, use `pnpm --filter @workspace/db run push`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Run scripts via `pnpm --filter @workspace/scripts run <script>`.
- `seed-sites` — Seeds the two monitored sites and default alert configuration.
