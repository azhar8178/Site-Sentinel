# Site Monitor - Monitoring & Alerting System

A self-hosted site monitoring and alerting system that checks your websites every 60 seconds, sends email alerts via AWS SES when issues are detected, and provides a mobile-friendly dashboard for real-time status monitoring.

Built for monitoring **Love Furniture IE** and **Love Furniture UK** Magento stores, but easily extendable to any website.

## Features

- **Automated Monitoring**: Checks site availability every 60 seconds
- **Smart Alerts**: Detects status transitions (up/down/slow) with deduplication — no alert spam
- **Email Notifications**: HTML-formatted alerts via AWS SES for downtime, slow response, and recovery
- **Mobile Dashboard**: Real-time status, response time charts, alert history, and configurable settings
- **User Authentication**: Simple username/password login system with JWT tokens
- **Configurable Thresholds**: Per-site slow response thresholds (default 5000ms)

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Mobile App (Expo) │────▶│  API Server      │────▶│  PostgreSQL  │
│   Web / iOS / Android│     │  (Express 5)     │     │  Database    │
└─────────────────────┘     │                  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Monitor    │  │     ┌──────────────┐
                            │  │ Worker     │──┼────▶│  AWS SES     │
                            │  │ (60s loop) │  │     │  (Emails)    │
                            │  └────────────┘  │     └──────────────┘
                            └──────────────────┘
```

## Tech Stack

- **Backend**: Node.js 24, Express 5, TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: Expo (React Native) — works on web, iOS, and Android
- **Email**: AWS SES v3 SDK
- **Auth**: JWT tokens
- **Monorepo**: pnpm workspaces
- **API**: OpenAPI 3.1 spec with generated React Query hooks

## Prerequisites

- **Node.js** >= 20 (v24 recommended)
- **pnpm** >= 9
- **PostgreSQL** >= 14
- **SMTP mail server** (any provider: Gmail, Outlook, AWS SES, your own server)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd site-monitor
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the project root (or set these as environment variables):

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/site_monitor
PORT=8080
JWT_SECRET=your-secure-random-secret-here

# Mobile app (for Expo web build)
EXPO_PUBLIC_DOMAIN=your-server-domain.com

# SMTP settings are configured in-app via Settings > SMTP Server
# No environment variables needed for email — it's all in the database
```

### 3. Set Up Database

```bash
# Push the schema to your PostgreSQL database
pnpm --filter @workspace/db run push

# Seed the monitored sites and default config
pnpm --filter @workspace/scripts run seed-sites
```

### 4. Build and Run the API Server

```bash
# Development
pnpm --filter @workspace/api-server run dev

# Production build
pnpm --filter @workspace/api-server run build
NODE_ENV=production node artifacts/api-server/dist/index.mjs
```

The API server starts on the port specified by `PORT` (default 8080). The monitoring worker starts automatically.

### 5. Run the Mobile App

```bash
# Development (web)
pnpm --filter @workspace/mobile run dev

# The app will be available at http://localhost:18115
```

### 6. Create Your First User

On first launch, navigate to the app and click "First time? Create Account". The first registered user automatically gets admin privileges.

## Deployment Guide

### Option A: Deploy with Docker (Recommended)

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:24-slim AS base
RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Build the API server
RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
```

```bash
docker build -t site-monitor .
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/site_monitor \
  -e JWT_SECRET=your-secret \
  --name site-monitor \
  site-monitor
```

### Option B: Deploy on a VPS (Ubuntu/Debian)

#### 1. Install Dependencies

```bash
# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm@10

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
```

#### 2. Set Up PostgreSQL

```bash
sudo -u postgres psql
CREATE DATABASE site_monitor;
CREATE USER monitor_user WITH PASSWORD 'your_db_password';
GRANT ALL PRIVILEGES ON DATABASE site_monitor TO monitor_user;
\q
```

#### 3. Clone and Build

```bash
cd /opt
git clone <your-repo-url> site-monitor
cd site-monitor
pnpm install

# Set environment variables
export DATABASE_URL=postgresql://monitor_user:your_db_password@localhost:5432/site_monitor
export PORT=8080
export JWT_SECRET=$(openssl rand -hex 32)
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_SES_REGION=eu-west-1

# Set up database
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed-sites

# Build
pnpm --filter @workspace/api-server run build
```

#### 4. Create a systemd Service

```bash
sudo tee /etc/systemd/system/site-monitor.service << 'EOF'
[Unit]
Description=Site Monitor API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/site-monitor
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=DATABASE_URL=postgresql://monitor_user:your_db_password@localhost:5432/site_monitor
Environment=JWT_SECRET=your-jwt-secret
ExecStart=/usr/bin/node artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable site-monitor
sudo systemctl start site-monitor
```

#### 5. Set Up Nginx Reverse Proxy (Optional but Recommended)

```bash
sudo apt-get install -y nginx

sudo tee /etc/nginx/sites-available/site-monitor << 'EOF'
server {
    listen 80;
    server_name monitor.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/site-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. Add SSL with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d monitor.yourdomain.com
```

### Option C: Deploy on AWS (EC2 + RDS)

1. Launch an EC2 instance (t3.micro is sufficient)
2. Create an RDS PostgreSQL instance
3. Follow the VPS guide above, using the RDS endpoint as `DATABASE_URL`
4. Configure Security Groups to allow port 80/443 inbound
5. Use an Application Load Balancer for SSL termination

## API Endpoints

### Authentication
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/register` | No (first user) / Yes (subsequent) | Create account — first user becomes admin |
| POST | `/api/auth/login` | No | Sign in, returns JWT token |
| GET | `/api/auth/me` | Yes | Get current user info |
| GET | `/api/auth/user-count` | No | Check if any users exist (for bootstrap UI) |

### Monitoring (Requires Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites` | List all monitored sites |
| GET | `/api/sites/:id` | Get a specific site |
| PUT | `/api/sites/:id` | Update site settings |
| POST | `/api/sites/:id/check` | Trigger a manual check |
| GET | `/api/sites/:id/checks` | Get check history (query: `hours`, `limit`, `offset`) |
| GET | `/api/alerts` | List alerts (query: `siteId`, `limit`, `offset`) |
| GET | `/api/config` | Get alert configuration |
| PUT | `/api/config` | Update alert configuration |

### Health (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

## Configuration

### Adding More Sites

Edit `scripts/src/seed-sites.ts` to add more sites, then re-run:

```bash
pnpm --filter @workspace/scripts run seed-sites
```

Or use the API directly:

```bash
curl -X PUT http://localhost:8080/api/sites/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slowThresholdMs": 3000}'
```

### Configuring Email Alerts

All email settings are configured from the **Settings** tab in the app — no environment variables needed:

1. Open the app and go to **Settings**
2. Under **SMTP Server**, enter your mail server details:
   - **SMTP Host** (e.g., `smtp.gmail.com`, `smtp.office365.com`, `email-smtp.eu-west-1.amazonaws.com`)
   - **Port** (usually 587 for STARTTLS, or 465 for SSL/TLS)
   - **Username** and **Password** (your SMTP credentials)
   - **SSL/TLS** toggle (enable for port 465)
3. Click **Test Connection** to verify your SMTP settings work
4. Under **Email Notifications**, configure:
   - **Sender Email** — the "From" address for alert emails
   - **Recipient Emails** — comma-separated list of people to alert
   - **Enable Alerts** toggle
5. Click **Save Changes**

You can also configure via the API:

```bash
curl -X PUT http://localhost:8080/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "smtpUsername": "your-email@gmail.com",
    "smtpPassword": "your-app-password",
    "smtpSecure": false,
    "senderEmail": "monitor@yourdomain.com",
    "recipientEmails": "team@company.com, alerts@company.com",
    "isEnabled": true
  }'
```

### Common SMTP Providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Gmail | `smtp.gmail.com` | 587 | Use an [App Password](https://support.google.com/accounts/answer/185833) |
| Microsoft 365 | `smtp.office365.com` | 587 | Use your M365 credentials |
| AWS SES | `email-smtp.{region}.amazonaws.com` | 587 | Create SMTP credentials in SES console |
| Custom | Your mail server | 587/465 | Check with your IT team |

## Project Structure

```
site-monitor/
├── artifacts/
│   ├── api-server/          # Express API + monitoring worker
│   │   └── src/
│   │       ├── middleware/auth.ts    # JWT auth middleware
│   │       ├── services/monitor.ts  # 60s site check loop
│   │       ├── services/email.ts    # AWS SES email alerts
│   │       └── routes/              # API route handlers
│   └── mobile/              # Expo mobile/web app
│       ├── app/
│       │   ├── login.tsx            # Login/register screen
│       │   └── (tabs)/             # Main app tabs
│       └── contexts/AuthContext.tsx  # Auth state management
├── lib/
│   ├── db/                  # Database schema (Drizzle ORM)
│   ├── api-spec/            # OpenAPI 3.1 specification
│   ├── api-client-react/    # Generated React Query hooks
│   └── api-zod/             # Generated Zod validation schemas
└── scripts/
    └── src/seed-sites.ts    # Database seed script
```

## Troubleshooting

### Monitoring not working
- Check the API server logs for errors
- Ensure `DATABASE_URL` is correctly set
- Verify the server can reach the monitored URLs (no firewall blocking outbound HTTP)

### Email alerts not sending
- Verify AWS SES credentials are set correctly
- Check if your SES account is still in sandbox mode (limited to verified emails only)
- Ensure sender email is verified in SES
- Check the API server logs for SES error messages

### Mobile app can't connect
- Ensure `EXPO_PUBLIC_DOMAIN` matches your server's domain
- The API server must be accessible over HTTPS for the mobile app to connect
- Check CORS settings if accessing from a different domain

### Database connection issues
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Ensure PostgreSQL is running and accepting connections
- Check that the database user has proper permissions

## Future Enhancements

- **Slack Integration**: The alert system is modular — Slack notifications can be added alongside email
- **SMTP Support**: Can be extended to support generic SMTP servers instead of just AWS SES
- **Multi-region Checks**: Run checks from multiple geographic locations
- **Status Page**: Public-facing status page for your users

## License

Private — Internal use only.
