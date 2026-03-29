# Site Monitoring and Alerting System

## Overview

This project is a comprehensive site monitoring and alerting system designed for two Magento e-commerce sites: lovefurniture.ie and lovefurniture.co.uk. Its primary purpose is to ensure continuous availability and optimal performance of these critical online stores. The system features a backend that performs regular site checks, a robust alerting mechanism via multiple channels, and real-time monitoring dashboards accessible via a mobile application and a web interface. The business vision is to provide a reliable tool for e-commerce businesses to minimize downtime, quickly identify performance issues, and ultimately improve customer satisfaction and revenue by ensuring their online stores are always operational.

Key capabilities include:
- Real-time site availability and performance monitoring.
- Multi-channel alerts for various site and server health issues.
- Detailed historical data and analytics for performance tracking.
- Integration with Magento for e-commerce specific insights like abandoned carts.
- User authentication and role-based access control for secure team management.
- Self-hosting capabilities via Docker for flexible deployment.

## User Preferences

- The agent should use clear, concise language.
- I prefer iterative development with small, manageable changes.
- Please ask for confirmation before implementing major architectural changes or introducing new external dependencies.
- Detailed explanations for complex logic or design decisions are appreciated.
- Do not make changes to the `artifacts-monorepo/artifacts/mockup-sandbox` directory.
- Do not modify the `lib/api-spec/openapi.yaml` file directly; all API changes should be reflected in the code and then generate the spec.

## System Architecture

The project is built as a pnpm monorepo, leveraging Node.js 24 and TypeScript 5.9.

**Core Components:**
- **API Server (`artifacts/api-server`):** An Express 5 API that serves as the backend for both monitoring and data management. It includes a monitoring worker that performs site checks, Magento sync service, and notification services (email, Slack, WhatsApp).
- **Web Dashboard (`artifacts/web-dashboard`):** A React and Vite-based web application providing a cross-platform browser interface for monitoring. It features dashboards, history, store insights, server vitals, alerts, and settings.
- **Mobile App (`artifacts/mobile`):** An Expo (React Native) application offering a real-time monitoring dashboard for mobile devices, mirroring the web dashboard's functionalities.

**Technical Implementations & Design Choices:**
- **Database:** PostgreSQL with Drizzle ORM is used for data persistence, including site configurations, check results, alerts, server metrics, and Magento data.
- **API Design:** RESTful API endpoints are defined with OpenAPI specification, and `orval` is used for code generation (React Query hooks, Zod schemas).
- **Validation:** Zod is integrated for robust request and response validation.
- **Monitoring Worker:** Checks site availability every 60 seconds, recording response times, status codes, and detecting state transitions to trigger alerts.
- **Server Vitals:** A lightweight Node.js agent monitors CPU, memory, disk, and network usage on servers, reporting metrics to the API server. Threshold-based alerting is configured for these vitals.
- **Magento Integration:** A background service fetches orders and carts every 5 minutes, providing insights into sales and abandoned carts.
- **Authentication & Authorization:** JWT-based authentication with role-based access control (`admin`, `editor`, `viewer`) ensures secure access to features.
- **UI/UX:** Both web and mobile dashboards feature a consistent design with status badges, charts for historical data, and configurable settings. The mobile app utilizes Expo for seamless cross-platform deployment.
- **Deployment:** Docker-based self-hosting is supported with provided `Dockerfile` and `docker-compose.yml` configurations, including Nginx for reverse proxy setup.

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Nodemailer:** For sending email alerts via generic SMTP.
- **AWS SES (originally mentioned, but switched to generic SMTP):** The system is now configured to use generic SMTP settings stored in the database for email alerts.
- **Magento REST API:** For fetching e-commerce data (orders, carts).
- **Slack Webhooks:** For sending Slack notifications.
- **WhatsApp Business API:** For sending WhatsApp notifications.
- **Expo:** Framework for building the mobile application.
- **React Native:** Mobile UI framework used by Expo.
- **React:** Web UI framework.
- **Vite:** Frontend build tool for the web dashboard.
- **Drizzle ORM:** TypeScript ORM for PostgreSQL.
- **Zod:** Schema declaration and validation library.
- **Orval:** OpenAPI client code generator.
- **Express:** Web application framework for Node.js.