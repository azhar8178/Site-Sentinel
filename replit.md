# Site Monitoring and Alerting System

## Overview

This project is a comprehensive site monitoring and alerting system designed for two Magento e-commerce sites: lovefurniture.ie and lovefurniture.co.uk. Its primary purpose is to ensure continuous availability and optimal performance of these critical online stores. The system features a backend that performs regular site checks, a robust alerting mechanism via multiple channels, and real-time monitoring dashboards accessible via a mobile application and a web interface. The business vision is to provide a reliable tool for e-commerce businesses to minimize downtime, quickly identify performance issues, and ultimately improve customer satisfaction and revenue by ensuring their online stores are always operational.

Key capabilities include:
- Real-time site availability and performance monitoring (60s checks).
- Server vitals monitoring (CPU/memory/disk/network) via lightweight agent.
- Multi-channel alerts: Email (SMTP), Slack (webhook), WhatsApp (Meta API).
- Magento integration: order/cart sync every 5 minutes, abandonment tracking.
- Team management with role-based access (admin/editor/viewer).
- Web dashboard (React + Vite) and mobile app (Expo/React Native).
- Self-hosting via Docker on EC2/VPS.

## User Preferences

- The agent should use clear, concise language.
- I prefer iterative development with small, manageable changes.
- Please ask for confirmation before implementing major architectural changes or introducing new external dependencies.
- Detailed explanations for complex logic or design decisions are appreciated.
- Do not make changes to the `artifacts-monorepo/artifacts/mockup-sandbox` directory.

## System Architecture

The project is built as a pnpm monorepo, leveraging Node.js 24 and TypeScript 5.9.

**Core Components:**
- **API Server (`artifacts/api-server`):** Express 5 API that serves both the API endpoints and the built web dashboard static files. Includes monitoring worker (60s site checks), server vitals alerting (60s), Magento sync (5m), and notification services (email, Slack, WhatsApp).
- **Web Dashboard (`artifacts/web-dashboard`):** React + Vite + Tailwind CSS web application. Pages: Dashboard, History, Store, Servers, Alerts, Settings. Built into the Docker image and served by the API server.
- **Mobile App (`artifacts/mobile`):** Expo (React Native) application for Android APK builds. Mirrors the web dashboard's functionality.
- **Server Agent (`agent/`):** Lightweight Node.js script that runs on each monitored server. Reports CPU, memory, disk, and network stats every 30s via API key authentication.

**Technical Details:**
- **Database:** PostgreSQL with Drizzle ORM. Schema in `lib/db/src/schema/`.
- **API Design:** OpenAPI spec in `lib/api-spec/openapi.yaml`. Code generation via `orval` produces React Query hooks in `lib/api-client-react/`.
- **Authentication:** JWT-based with roles (admin, editor, viewer). Default admin user `admin`/`admin123` auto-seeded on fresh deploys.
- **Docker deployment:** `Dockerfile` builds Vite dashboard + API server. `docker-compose.yml` runs PostgreSQL + API. Nginx proxies everything to port 8080.
- **Sensitive field masking:** Settings page uses `"••••••••"` (MASK constant) for sensitive fields like SMTP password, API tokens.
- **use-auth.tsx:** Must stay as `.tsx` (contains JSX). Auth context with login/logout/token management.

**Key files:**
- `artifacts/web-dashboard/src/pages/settings.tsx` — Full settings with SMTP/Slack/WhatsApp/Magento/Thresholds/Team management
- `artifacts/web-dashboard/src/pages/servers.tsx` — Server cards with Add/Edit/Delete, API key display + regeneration, detail modal with charts
- `artifacts/web-dashboard/src/hooks/use-auth.tsx` — Auth context (must be .tsx)
- `artifacts/web-dashboard/vite.config.ts` — Proxy, defaults for PORT/BASE_PATH
- `artifacts/api-server/scripts/migrate.mjs` — Creates tables + seeds admin user + sites + configs
- `artifacts/api-server/src/routes/servers.ts` — reportRouter (POST /servers/report, x-api-key auth), server CRUD, key regeneration
- `artifacts/api-server/src/services/monitor.ts` — Site health check loop (60s), sends downtime/slow/recovery alerts
- `artifacts/api-server/src/services/server-vitals.ts` — Server vitals alerting (CPU/mem/disk thresholds)
- `agent/monitor-agent.js` — Monitoring agent; posts to `${API_URL}/api/servers/report`
- `agent/install.sh` — Agent install script
- `Dockerfile` — Builds Vite dashboard + API server

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Nodemailer:** For sending email alerts via generic SMTP.
- **Magento REST API:** For fetching e-commerce data (orders, carts).
- **Slack Webhooks:** For sending Slack notifications.
- **WhatsApp Business API (Meta):** For sending WhatsApp notifications.
- **Expo:** Framework for building the mobile application.
- **React / React Native:** UI frameworks.
- **Vite:** Frontend build tool for the web dashboard.
- **Drizzle ORM:** TypeScript ORM for PostgreSQL.
- **Zod:** Schema declaration and validation library.
- **Orval:** OpenAPI client code generator.
- **Express:** Web application framework for Node.js.
