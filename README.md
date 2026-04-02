# Site Sentinel

A self-hosted monitoring and alerting system for your websites. Checks site availability every 60 seconds, monitors server vitals and service health via a lightweight agent, tracks Magento orders and carts, and sends alerts via Email, Slack, and WhatsApp.

Built for **Love Furniture IE** (lovefurniture.ie, EUR) and **Love Furniture UK** (lovefurniture.co.uk, GBP) Magento stores.

## What It Does

- Checks your sites every 60 seconds — detects downtime, slow responses, and recovery
- Server vitals monitoring: CPU, memory, disk, network via lightweight agent (v3.0.0)
- Service-level health monitoring: Nginx, Varnish, PHP-FPM, MySQL, Elasticsearch
- SSL certificate expiry tracking per domain — warns when certificates are expiring soon
- Magento integration: syncs orders and abandoned carts every 5 minutes
- Multi-channel alerts: Email (SMTP), Slack (webhook), WhatsApp (Meta API)
- Health Report: a clean, printable report covering servers, services, SSL, sites, and payment gateways — split by IE and UK stores
- Google Analytics integration: OAuth-linked GA4 property with status visible in dashboard
- Web dashboard (React + Vite) for browser access
- Mobile app (React Native / Expo) for Android APK builds
- Team management: admin/editor/viewer roles with user CRUD
- Per-site configurable slow response thresholds
- Per-server configurable alert thresholds (CPU/mem/disk)
- Simple username/password authentication with JWT

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Web Dashboard     │────▶│  API Server      │────▶│  PostgreSQL  │
│   (React + Vite)    │     │  (Node.js)       │     │              │
│                     │     │                  │     └──────────────┘
│   Mobile App        │────▶│  ┌────────────┐  │
│   (React Native)    │     │  │ Site        │  │     ┌──────────────┐
└─────────────────────┘     │  │ Monitor    │──┼────▶│  SMTP / Slack │
                            │  │ (60s loop) │  │     │  / WhatsApp  │
                            │  └────────────┘  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Magento    │  │     ┌──────────────┐
                            │  │ Sync       │──┼────▶│  Magento API │
                            │  │ (5m loop)  │  │     │  (REST V1)   │
                            │  └────────────┘  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Server     │  │
                            │  │ Vitals     │  │
                            │  │ Monitor    │  │
                            │  │ (60s loop) │  │
                            │  └────────────┘  │
                            └──────────────────┘
                                    ▲
┌─────────────────────┐             │
│  Server Agent v3    │─────────────┘
│  (monitor-agent.js) │  Reports every 30s:
│                     │  CPU, mem, disk, net
└─────────────────────┘  Nginx, Varnish, PHP-FPM
                         MySQL, Elasticsearch, SSL
```

The Docker image builds both the Vite web dashboard and the API server. The API server serves the static dashboard files and the API — Nginx just proxies everything to port 8080.

---

## Self-Hosting Guide

### What You Need

- A Linux server (EC2 t3.micro is plenty, or any VPS with Ubuntu 22.04/24.04)
- A domain name pointing to your server (e.g., `monit.lovefurniture.ie`)
- An SMTP mail server for email alerts (configured later in the dashboard)

### Overview of Steps

1. Prepare the server (install Docker, Git)
2. Clone the repo
3. Configure environment variables
4. Start PostgreSQL and the API server with Docker Compose
5. Set up Nginx + SSL
6. Log in and configure alerts
7. Install the server vitals agent on each server to monitor
8. (Optional) Build the Android APK

---

### Step 1: Prepare the Server

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install Nginx + Certbot for SSL
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

Log out and back in so the docker group takes effect:

```bash
exit
ssh your-server
```

Verify:

```bash
docker --version         # Docker 24+ or 27+
docker compose version   # Docker Compose v2+
nginx -v                 # nginx/1.x
```

---

### Step 2: Clone the Repo

```bash
cd /opt
sudo git clone <your-repo-url> site-monitor
sudo chown -R $USER:$USER site-monitor
cd site-monitor
```

---

### Step 3: Configure Environment

```bash
cat > .env << EOF
DATABASE_URL=postgresql://monitor:changeme_db_password@postgres:5432/site_monitor
JWT_SECRET=$(openssl rand -hex 32)
PORT=8080
NODE_ENV=production
BASE_PATH=/
EOF
```

Change `changeme_db_password` to a strong password.

**Optional — Magento Integration:**

If you want Magento order/cart tracking, add these to your `.env`:

```bash
cat >> .env << EOF
MAGENTO_API_URL=https://www.lovefurniture.ie
MAGENTO_ADMIN_USER=azhar
MAGENTO_ADMIN_PASS=YourMagentoAdminPassword
EOF
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MAGENTO_API_URL` | Yes (for Magento) | Base URL of your Magento store |
| `MAGENTO_ADMIN_USER` | Recommended | Magento admin username — auto-refreshes API tokens |
| `MAGENTO_ADMIN_PASS` | Recommended | Magento admin password |
| `MAGENTO_API_TOKEN` | Fallback | Static bearer token (if username/password auth blocked by WAF) |

---

### Step 4: Start Everything with Docker Compose

The project already includes a `Dockerfile` and `docker-compose.yml`. Start everything:

```bash
docker compose up -d --build
```

Wait about 30 seconds, then verify both containers are running:

```bash
docker compose ps
```

You should see `postgres` and `api` with status "Up".

The database tables and default admin user (`admin` / `admin123`) are created automatically on first start.

---

### Step 5: Set Up Nginx + SSL

Create the Nginx config (replace `monit.lovefurniture.ie` with your domain):

```bash
sudo tee /etc/nginx/sites-available/site-monitor << 'EOF'
server {
    listen 80;
    server_name monit.lovefurniture.ie;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/site-monitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Add SSL:

```bash
sudo certbot --nginx -d monit.lovefurniture.ie
```

Verify:

```bash
curl -s https://monit.lovefurniture.ie/api/healthz
# Should return: {"status":"ok"}
```

---

### Step 6: Log In and Configure

Open `https://monit.lovefurniture.ie` in your browser.

**Default admin credentials:** `admin` / `admin123`

**Change your password immediately** in Settings > Team Management.

Then configure your alert channels in Settings:
- **SMTP** — for email alerts
- **Slack** — paste your Slack webhook URL
- **WhatsApp** — enter your Meta API token and phone number ID

You can also configure the following in Settings:
- **Google Analytics** — link a GA4 property via OAuth for traffic visibility in the dashboard
- **Health Report** — set the company name and configure IE/UK payment gateway statuses that appear in the printable health report

---

### Step 7: Install the Server Vitals Agent

The agent (v3.0.0) is a lightweight Node.js script that runs on each server you want to monitor. It collects CPU, memory, disk, network, and service-level metrics (Nginx, Varnish, PHP-FPM, MySQL, Elasticsearch) and reports them to the API every 30 seconds.

**Step 7a: Register the server in the dashboard**

Go to **Servers** page > click **Add Server** > enter a name and hostname. Copy the **API Key** shown.

**Step 7b: Install the agent on the target server**

SSH into the server you want to monitor:

```bash
# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create agent directory
sudo mkdir -p /opt/monitor-agent

# Copy agent files (from repo clone, scp, or download)
sudo cp agent/monitor-agent.js /opt/monitor-agent/
sudo cp agent/monitor-agent.service /etc/systemd/system/

# Configure the agent
sudo tee /opt/monitor-agent/.env > /dev/null << EOF
MONITOR_API_URL=https://monit.lovefurniture.ie
MONITOR_API_KEY=sm_YOUR_API_KEY_HERE
MONITOR_INTERVAL=30
MONITOR_SSL_DOMAINS=lovefurniture.ie,lovefurniture.co.uk
EOF

sudo chmod 600 /opt/monitor-agent/.env

# Enable and start the agent
sudo systemctl daemon-reload
sudo systemctl enable monitor-agent
sudo systemctl start monitor-agent
```

**Agent environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `MONITOR_API_URL` | Yes | Base URL of your Site Sentinel instance — no trailing `/api` |
| `MONITOR_API_KEY` | Yes | API key shown when you register a server in the dashboard |
| `MONITOR_INTERVAL` | No | Reporting interval in seconds (default: 30) |
| `MONITOR_SSL_DOMAINS` | No | Comma-separated list of domains to check SSL expiry for |

**Important:** `MONITOR_API_URL` must be the base URL **without** `/api` at the end. The agent appends `/api/servers/report` automatically.

**Verify it's working:**

```bash
sudo systemctl status monitor-agent
sudo journalctl -u monitor-agent -f
```

You should see lines like `CPU: 12.3% | Mem: 45.2% | Disk: 23.1% | Load: 0.5` every 30 seconds. Service metrics (Nginx, Varnish, etc.) are collected automatically if those processes are running on the server.

**To regenerate an API key** for a server, click the server card in the dashboard, then click "Regenerate API Key". Update the `.env` on the server and restart: `sudo systemctl restart monitor-agent`.

---

### Step 8: Build the Android APK (Optional)

This is done on your local dev machine, not the server:

```bash
git clone <your-repo-url> site-monitor
cd site-monitor
pnpm install

export EXPO_PUBLIC_DOMAIN=monit.lovefurniture.ie

cd artifacts/mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK will be at: `artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## Maintenance

### Checking Logs

```bash
# API server logs
docker compose logs -f api

# PostgreSQL logs
docker compose logs -f postgres

# Server agent logs (on each monitored server)
sudo journalctl -u monitor-agent -f
```

### Updating (Redeployment)

```bash
cd /opt/site-monitor
git pull origin main

# Rebuild and restart (keeps database intact)
docker compose down
docker compose up -d --build

# Check health
curl -s https://monit.lovefurniture.ie/api/healthz
```

To **wipe the database** and start fresh (use `-v` flag):

```bash
docker compose down -v
docker compose up -d --build
```

### Update the Server Agent

If you update `agent/monitor-agent.js`:

```bash
# On each monitored server
sudo cp agent/monitor-agent.js /opt/monitor-agent/
sudo systemctl restart monitor-agent
```

The agent version is shown in each report payload. The current version is **v3.0.0**.

### Backup Database

```bash
docker compose exec postgres pg_dump -U monitor site_monitor > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
docker compose exec -T postgres psql -U monitor site_monitor < backup_20260326.sql
```

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Sign in, returns JWT |
| GET | `/api/auth/me` | Yes | Current user info |

### Sites & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites` | List all sites |
| GET | `/api/sites/:id` | Get a specific site |
| PUT | `/api/sites/:id` | Update site settings |
| POST | `/api/sites/:id/check` | Trigger manual check |
| GET | `/api/sites/:id/checks` | Check history |
| GET | `/api/alerts` | Alert history |
| GET | `/api/config` | Get alert/SMTP/Slack/WhatsApp config |
| PUT | `/api/config` | Update config |
| POST | `/api/config/test-smtp` | Test SMTP connection |

### Server Vitals

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/servers` | JWT | List registered servers |
| POST | `/api/servers` | JWT | Register a new server (returns API key) |
| GET | `/api/servers/:id` | JWT | Get server details |
| PUT | `/api/servers/:id` | JWT | Update server name/hostname |
| DELETE | `/api/servers/:id` | JWT | Remove a server |
| POST | `/api/servers/:id/regenerate-key` | JWT (admin) | Regenerate API key |
| GET | `/api/servers/:id/metrics?hours=1` | JWT | Server metrics history |
| POST | `/api/servers/report` | API Key (`x-api-key`) | Agent reports metrics (CPU, mem, disk, services, SSL) |

### Health Report

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health-report` | JWT | Full health report: sites, servers, services, SSL, gateways |

### Configuration

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/config/health-report` | JWT | Get health report config (company name, IE/UK gateways) |
| PUT | `/api/config/health-report` | JWT (admin) | Update health report config |
| GET | `/api/config/google-analytics` | JWT | Get Google Analytics OAuth config |
| PUT | `/api/config/google-analytics` | JWT (admin) | Update Google Analytics config |
| GET | `/api/config/server-alerts` | JWT | Get per-server alert thresholds |
| PUT | `/api/config/server-alerts` | JWT (admin) | Update server alert thresholds |

### Team Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | JWT (admin) | List all users |
| POST | `/api/users` | JWT (admin) | Create user |
| PUT | `/api/users/:id` | JWT (admin) | Update user |
| DELETE | `/api/users/:id` | JWT (admin) | Delete user |
| POST | `/api/users/:id/reset-password` | JWT (admin) | Reset user password |

### Magento Store

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/magento/stats` | Order stats (today, this week, abandonment rate) |
| GET | `/api/magento/orders` | Recent orders |
| GET | `/api/magento/carts` | Abandoned/active carts |
| GET | `/api/magento/sync` | Last sync status |
| POST | `/api/magento/sync` | Trigger manual sync |

All endpoints except auth and server report require a JWT token in the `Authorization: Bearer <token>` header.

---

## Troubleshooting

### API server won't start
- Check logs: `docker compose logs api`
- Verify PostgreSQL is running: `docker compose ps`
- Verify `DATABASE_URL` in `.env` matches the postgres service credentials

### Sites not being monitored
- Check API logs: `docker compose logs -f api`
- Verify the server can reach your sites (no firewall blocking outbound HTTP)
- Monitoring starts automatically when the API server starts

### Email alerts not sending
- Go to Settings > SMTP Server in the dashboard
- Click **Test Connection** to verify SMTP settings
- Check that alerts are enabled and recipient emails are configured

### Slack alerts not sending
- Verify the webhook URL is correct in Settings > Slack
- Test from the dashboard — it shows success/error inline

### Server agent 401 errors
- Verify the `MONITOR_API_URL` does **not** end with `/api`. Correct: `https://monit.lovefurniture.ie`. Wrong: `https://monit.lovefurniture.ie/api`.
- Verify the API key matches what was generated when you registered the server
- If the key was regenerated, update `/opt/monitor-agent/.env` and restart: `sudo systemctl restart monitor-agent`

### Server agent "service not found"
- The `.service` file must be in `/etc/systemd/system/`, not `/opt/monitor-agent/`
- Fix: `sudo cp /opt/monitor-agent/monitor-agent.service /etc/systemd/system/ && sudo systemctl daemon-reload`

### Service metrics not appearing in Health Report
- Service metrics require agent v3.0.0 or later — check with `sudo journalctl -u monitor-agent | grep version`
- Copy the updated `agent/monitor-agent.js` to `/opt/monitor-agent/` and restart the agent
- Nginx/Varnish/Elasticsearch metrics are only collected if those processes are running on the monitored server

### SSL expiry not showing
- Set `MONITOR_SSL_DOMAINS=yourdomain.ie,yourdomain.co.uk` in `/opt/monitor-agent/.env` and restart the agent
- The agent checks expiry using a TLS socket connection, so port 443 must be reachable from the monitored server

### Magento sync not working
- Check API logs: `docker compose logs -f api | grep magento`
- If the WAF blocks the token endpoint (403), generate a static token locally on the Magento server and use `MAGENTO_API_TOKEN` in `.env`
- Verify the Magento admin user has appropriate role permissions

### Database issues
- Check PostgreSQL: `docker compose exec postgres psql -U monitor -d site_monitor -c "SELECT 1;"`
- Check disk space: `df -h`

---

## Project Structure

```
site-monitor/
├── artifacts/
│   ├── api-server/              # API server + monitoring workers
│   │   └── src/
│   │       ├── middleware/auth.ts    # JWT authentication
│   │       ├── services/
│   │       │   ├── monitor.ts       # 60s site check loop + alerts
│   │       │   ├── email.ts         # SMTP email alerts
│   │       │   ├── slack.ts         # Slack webhook alerts
│   │       │   ├── whatsapp.ts      # WhatsApp Meta API alerts
│   │       │   ├── magento.ts       # Magento sync (5m loop)
│   │       │   └── server-vitals.ts # Server vitals alerting (60s loop)
│   │       └── routes/
│   │           ├── sites.ts         # Site monitoring endpoints
│   │           ├── servers.ts       # Server vitals + service metrics report endpoint
│   │           ├── magento.ts       # Magento order/cart endpoints
│   │           ├── users.ts         # Team management endpoints
│   │           ├── config.ts        # Alert + health report + GA config endpoints
│   │           └── health-report.ts # Health report endpoint (sites/servers/services/SSL/gateways)
│   ├── web-dashboard/           # Web dashboard (React + Vite + Tailwind)
│   │   └── src/
│   │       └── pages/
│   │           ├── dashboard.tsx    # Site status overview
│   │           ├── servers.tsx      # Server vitals + edit + API key regen
│   │           ├── store.tsx        # Magento orders & carts
│   │           ├── alerts.tsx       # Alert history
│   │           ├── history.tsx      # Check history
│   │           ├── health-report.tsx # Printable health report (IE/UK split, services, SSL)
│   │           └── settings.tsx     # SMTP/Slack/WhatsApp/GA/Health Report/Team/Thresholds
│   └── mobile/                  # Mobile app (Expo / React Native)
├── agent/
│   ├── monitor-agent.js         # Server vitals agent v3.0.0
│   │                            # Collects: CPU, mem, disk, net, Nginx, Varnish,
│   │                            # PHP-FPM, MySQL, Elasticsearch, SSL expiry
│   ├── monitor-agent.service    # Systemd service file (copy to /etc/systemd/system/)
│   └── install.sh               # Automated install script
├── lib/
│   ├── db/                      # Database schema (Drizzle ORM)
│   │   └── src/schema/
│   │       └── servers.ts       # server_metrics table (incl. nginx/varnish/elasticsearch/ssl_expiry columns)
│   ├── api-spec/                # OpenAPI spec
│   └── api-client-react/        # Generated React Query hooks
├── Dockerfile                   # Builds web dashboard + API server
└── docker-compose.yml
```
