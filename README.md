# Site Monitor

A self-hosted monitoring and alerting system for your websites. Checks availability every 60 seconds, sends email alerts when issues are detected, and provides a mobile dashboard + web dashboard for real-time status.

Built for **Love Furniture IE** and **Love Furniture UK** Magento stores.

## What It Does

- Checks your sites every 60 seconds
- Detects downtime, slow responses, and recovery
- Sends email alerts via any SMTP server (Gmail, Microsoft 365, AWS SES, etc.)
- **Magento integration**: Syncs orders and carts every 5 minutes, tracks abandonment rate
- **Server vitals monitoring**: CPU, memory, disk, network via lightweight agent
- Mobile app (Android APK) + web dashboard for real-time monitoring
- Simple username/password authentication
- Per-site configurable slow response thresholds

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Mobile App /      │────▶│  API Server      │────▶│  PostgreSQL  │
│   Web Dashboard     │     │  (Node.js)       │     │              │
└─────────────────────┘     │                  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Monitor    │  │     ┌──────────────┐
                            │  │ Worker     │──┼────▶│  SMTP Server │
                            │  │ (60s loop) │  │     │  (Email)     │
                            │  └────────────┘  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Magento    │  │     ┌──────────────┐
                            │  │ Sync       │──┼────▶│  Magento API │
                            │  │ (5m loop)  │  │     │  (REST V1)   │
                            │  └────────────┘  │     └──────────────┘
                            └──────────────────┘
                                    ▲
┌─────────────────────┐             │
│  Server Agent       │─────────────┘
│  (monitor-agent.js) │  Reports CPU/mem/disk/net every 30s
└─────────────────────┘
```

---

## Self-Hosting Guide

### What You Need

- A Linux server (EC2 t3.micro is plenty, or any VPS with Ubuntu 22.04/24.04)
- A domain name pointing to your server (e.g., `monitor.yourdomain.com`)
- An SMTP mail server for alerts (configured later in-app)

### Overview of Steps

1. Prepare the server (install Docker, Node.js, pnpm, Git)
2. Clone the repo
3. Configure environment variables
4. Start PostgreSQL and the API server with Docker Compose
5. Initialize the database
6. Set up Nginx + SSL
7. Create your admin account
8. Configure email alerts in the app
9. Build the Android APK and deploy via MDM

---

### Step 1: Prepare the Server

SSH into your fresh server and install all prerequisites:

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y curl git ufw

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (included with modern Docker, verify it works)
docker compose version
# If the above fails, install manually:
# sudo apt-get install -y docker-compose-plugin

# Install Node.js 24 (needed for database setup commands)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm (needed for database setup commands)
npm install -g pnpm@10

# Install Nginx (for reverse proxy + SSL)
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

**Important:** Log out and log back in after adding yourself to the `docker` group, so you can run Docker without `sudo`:

```bash
exit
# SSH back in
ssh your-server
```

Verify everything is installed:

```bash
docker --version        # Docker 24+ or 27+
docker compose version  # Docker Compose v2+
node --version          # v24.x
pnpm --version          # 10.x
nginx -v                # nginx/1.x
git --version           # git 2.x
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

Generate a secure JWT secret and create a `.env` file:

```bash
cat > .env << EOF
DATABASE_URL=postgresql://monitor:changeme_db_password@postgres:5432/site_monitor
JWT_SECRET=$(openssl rand -hex 32)
PORT=8080
NODE_ENV=production

# Magento Integration (optional — remove if not using Magento)
MAGENTO_API_URL=https://www.lovefurniture.ie
MAGENTO_ADMIN_USER=azhar
MAGENTO_ADMIN_PASS=YourMagentoAdminPassword
EOF
```

Change `changeme_db_password` to a strong password of your choice.

**Magento environment variables explained:**

| Variable | Required | Description |
|----------|----------|-------------|
| `MAGENTO_API_URL` | Yes (for Magento) | Base URL of your Magento store (e.g. `https://www.lovefurniture.ie`) |
| `MAGENTO_ADMIN_USER` | Recommended | Magento admin username — auto-refreshes API tokens |
| `MAGENTO_ADMIN_PASS` | Recommended | Magento admin password |
| `MAGENTO_API_TOKEN` | Fallback | Static bearer token (expires ~1hr). Only needed if username/password auth is unavailable |

When `MAGENTO_ADMIN_USER` and `MAGENTO_ADMIN_PASS` are set, the API server automatically fetches and refreshes Magento tokens. This is the recommended approach for self-hosted setups where the API server runs on the same network as Magento.

If running on a different network where token endpoint is blocked by WAF, generate a static token on the Magento server:

```bash
curl -X POST http://localhost/rest/V1/integration/admin/token \
  -H "Content-Type: application/json" \
  -d '{"username":"azhar","password":"YourPassword"}'
```

Then set `MAGENTO_API_TOKEN` in your `.env`. Note: static tokens expire after ~1 hour by default (configurable in Magento admin).

**Important:** The Magento admin user needs the **Administrators** role (or equivalent permissions for Sales and Cart API access).

---

### Step 4: Start Everything with Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: site_monitor
      POSTGRES_USER: monitor
      POSTGRES_PASSWORD: changeme_db_password  # Match your .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

  api:
    build: .
    restart: always
    depends_on:
      - postgres
    env_file: .env
    ports:
      - "127.0.0.1:8080:8080"

volumes:
  pgdata:
```

Create the `Dockerfile`:

```dockerfile
FROM node:24-slim
RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080
CMD ["node", "artifacts/api-server/dist/index.mjs"]
```

Start everything:

```bash
docker compose up -d
```

Wait about 30 seconds for PostgreSQL to be ready, then check both containers are running:

```bash
docker compose ps
```

You should see both `postgres` and `api` with status "Up".

---

### Step 5: Initialize the Database

Run these commands from the project directory on your server (Node.js and pnpm were installed in Step 1):

```bash
# Install project dependencies on the host (needed for DB commands)
pnpm install

# Point to PostgreSQL (localhost because we mapped port 5432)
export DATABASE_URL=postgresql://monitor:changeme_db_password@localhost:5432/site_monitor

# Create all database tables
pnpm --filter @workspace/db run push

# Add the monitored sites (Love Furniture IE & UK)
pnpm --filter @workspace/scripts run seed-sites
```

Verify the database is set up:

```bash
docker compose exec postgres psql -U monitor -d site_monitor -c "SELECT name, url FROM sites;"
```

You should see both Love Furniture sites listed.

---

### Step 6: Set Up Nginx + SSL

Nginx and Certbot were already installed in Step 1. Now configure them.

First, build the web version of the dashboard:

```bash
cd ~/Site-Sentinel/artifacts/mobile
EXPO_PUBLIC_DOMAIN=monitor.yourdomain.com npx expo export --platform web
```

This creates a `dist/` folder with the static web app. Now copy it where Nginx can serve it:

```bash
sudo mkdir -p /var/www/site-monitor
sudo cp -r ~/Site-Sentinel/artifacts/mobile/dist/* /var/www/site-monitor/
sudo chown -R www-data:www-data /var/www/site-monitor
```

Create the Nginx config (replace `monitor.yourdomain.com` with your actual domain):

```bash
sudo tee /etc/nginx/sites-available/site-monitor << 'EOF'
server {
    listen 80;
    server_name monitor.yourdomain.com;

    # API requests go to the backend
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Web dashboard (static files)
    location / {
        root /var/www/site-monitor;
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/site-monitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Add SSL (free, auto-renewing):

```bash
sudo certbot --nginx -d monitor.yourdomain.com
```

Verify it's working:

```bash
# API should respond
curl -s https://monitor.yourdomain.com/api/healthz
# Should return: {"status":"ok"}

# Web dashboard should load
curl -s -o /dev/null -w "%{http_code}" https://monitor.yourdomain.com/
# Should return: 200
```

---

### Step 7: Create Your Admin Account

Open the API in your browser or use curl:

```bash
curl -s -X POST https://monitor.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-secure-password"}'
```

This first user automatically becomes the admin. Save the token from the response — you'll need it for any API calls.

---

### Step 8: Configure Email Alerts

Email is configured from the mobile app (or via API). No environment variables needed.

**Via API** (before you have the app):

```bash
# Get your token first
TOKEN=$(curl -s -X POST https://monitor.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-secure-password"}' | \
  node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")

# Configure SMTP and alert recipients
curl -X PUT https://monitor.yourdomain.com/api/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "smtpUsername": "your-email@gmail.com",
    "smtpPassword": "your-app-password",
    "smtpSecure": false,
    "senderEmail": "alerts@yourdomain.com",
    "recipientEmails": "you@company.com, team@company.com",
    "isEnabled": true
  }'
```

**Via the app** (once you have it installed):

Go to **Settings** tab > **SMTP Server** section, fill in your details, and hit **Test Connection** to verify.

### Common SMTP Providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Gmail | `smtp.gmail.com` | 587 | Use an [App Password](https://support.google.com/accounts/answer/185833) |
| Microsoft 365 | `smtp.office365.com` | 587 | Use your M365 credentials |
| AWS SES | `email-smtp.{region}.amazonaws.com` | 587 | Create SMTP credentials in SES console |
| Custom | Your mail server | 587/465 | Ask your IT team |

---

### Step 9: Set Up the Server Vitals Agent

The server agent is a lightweight Node.js script that runs on each server you want to monitor. It reports CPU, memory, disk, and network stats every 30 seconds.

**On the API server (or any server you want to monitor):**

First, register the server in the app. Go to the **Servers** tab and add a new server. Copy the **API Key** that's generated.

Then install the agent:

```bash
sudo mkdir -p /opt/monitor-agent
sudo cp agent/monitor-agent.js /opt/monitor-agent/

cat > /opt/monitor-agent/.env << EOF
MONITOR_API_URL=https://monitor.yourdomain.com
MONITOR_API_KEY=sm_xxxxxxxxxxxx
MONITOR_INTERVAL=30
EOF
```

Install as a systemd service (runs on boot, auto-restarts):

```bash
sudo cp agent/monitor-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monitor-agent
sudo systemctl start monitor-agent
```

Verify it's running:

```bash
sudo systemctl status monitor-agent
sudo journalctl -u monitor-agent -f
```

You should see lines like `CPU: 12.3% | Mem: 45.2% | Disk: 23.1% | Load: 0.5` every 30 seconds.

Repeat this for each server you want to monitor (your Magento web server, database server, etc.).

---

### Step 10: Build the Android APK

This is done on your local dev machine (not the server). You need Node.js, pnpm, and Android SDK installed.

```bash
# Clone the repo on your dev machine (if not already)
git clone <your-repo-url> site-monitor
cd site-monitor
pnpm install

# Set the API server domain (your production server)
export EXPO_PUBLIC_DOMAIN=monitor.yourdomain.com

# Generate the Android project
cd artifacts/mobile
npx expo prebuild --platform android

# Build the APK
cd android
./gradlew assembleRelease
```

The APK will be at:
```
artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Upload this APK to **ManageEngine MDM** for distribution to your organization's devices.

**Before building**, you may want to customize `artifacts/mobile/app.json`:
- `name` — Display name on the device
- `android.package` — Package identifier (e.g., `com.yourcompany.sitemonitor`)
- `version` — Version number

---

## Maintenance

### Checking Logs

```bash
# API server logs
docker compose logs -f api

# PostgreSQL logs
docker compose logs -f postgres
```

### Restarting

```bash
docker compose restart api
```

### Updating (Redeployment)

When you've pulled new code (e.g. after adding Magento integration, new tabs, etc.):

```bash
cd /opt/site-monitor
git pull

# Update the .env if new variables are needed (e.g. Magento)
nano .env

# Rebuild and restart the API server
docker compose build api
docker compose up -d api

# Run database migrations (creates any new tables like magento_orders, magento_carts, etc.)
export DATABASE_URL=postgresql://monitor:changeme_db_password@localhost:5432/site_monitor
pnpm install
pnpm --filter @workspace/db run push

# Verify the new tables exist
docker compose exec postgres psql -U monitor -d site_monitor -c "\dt"

# Check API server is healthy
curl -s https://monitor.yourdomain.com/api/healthz
```

If you also need to update the **web dashboard**:

```bash
cd /opt/site-monitor/artifacts/mobile
EXPO_PUBLIC_DOMAIN=monitor.yourdomain.com npx expo export --platform web
sudo cp -r dist/* /var/www/site-monitor/
sudo chown -R www-data:www-data /var/www/site-monitor
```

If you need to rebuild the **Android APK** (on your dev machine):

```bash
cd site-monitor
git pull
pnpm install
cd artifacts/mobile
EXPO_PUBLIC_DOMAIN=monitor.yourdomain.com npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

If you updated the **server agent**:

```bash
sudo cp agent/monitor-agent.js /opt/monitor-agent/
sudo systemctl restart monitor-agent
```

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
| POST | `/api/auth/register` | First user: No / After: Yes | Create account |
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
| GET | `/api/config` | Get alert/SMTP config |
| PUT | `/api/config` | Update alert/SMTP config |
| POST | `/api/config/test-smtp` | Test SMTP connection |

### Server Vitals

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/servers` | JWT | List registered servers |
| POST | `/api/servers` | JWT | Register a new server (returns API key) |
| DELETE | `/api/servers/:id` | JWT | Remove a server |
| GET | `/api/servers/:id/vitals` | JWT | Get vitals history for a server |
| POST | `/api/servers/report` | API Key (`x-api-key`) | Agent reports metrics (no JWT needed) |

### Magento Store

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/magento/stats` | Order stats (today, this week, abandonment rate) |
| GET | `/api/magento/orders` | Recent orders (query: `?limit=20`) |
| GET | `/api/magento/carts` | Abandoned/active carts (query: `?limit=20`) |
| GET | `/api/magento/sync` | Last sync status log |
| POST | `/api/magento/sync` | Trigger manual sync |

All endpoints except auth and server report require a JWT token in the `Authorization: Bearer <token>` header.

---

## Troubleshooting

### API server won't start
- Check logs: `docker compose logs api`
- Verify PostgreSQL is running: `docker compose ps`
- Verify `DATABASE_URL` in `.env` matches the postgres service credentials

### Sites not being monitored
- Check API logs for errors: `docker compose logs -f api`
- Verify the server can reach your sites (no firewall blocking outbound HTTP)
- Monitoring starts automatically when the API server starts

### Email alerts not sending
- Go to Settings > SMTP Server in the app
- Click **Test Connection** to verify SMTP settings
- Check that "Enable Alerts" is ON and recipient emails are configured
- Check API logs for SMTP error messages

### Mobile app can't connect
- Verify the app was built with the correct `EXPO_PUBLIC_DOMAIN`
- The server must be accessible over HTTPS (the app uses `https://`)
- Check that Nginx is running and SSL certificate is valid

### Magento sync not working
- Check API logs: `docker compose logs -f api | grep magento`
- Verify `MAGENTO_API_URL` is reachable from the server: `curl -s https://www.lovefurniture.ie/rest/V1/store/storeConfigs`
- If using admin user/pass, verify the credentials work: `curl -X POST https://www.lovefurniture.ie/rest/V1/integration/admin/token -H "Content-Type: application/json" -d '{"username":"azhar","password":"YourPassword"}'`
- If the WAF blocks the token endpoint, use `MAGENTO_API_TOKEN` instead (generate from localhost on the Magento server)
- Verify the Magento admin user has **Administrators** role permissions
- Sync runs every 5 minutes automatically; force a manual sync via the Store tab or API: `curl -X POST https://monitor.yourdomain.com/api/magento/sync -H "Authorization: Bearer $TOKEN"`

### Server vitals agent not reporting
- Check agent status: `sudo systemctl status monitor-agent`
- Check agent logs: `sudo journalctl -u monitor-agent -f`
- Verify the API key matches: the key shown when you registered the server in the app
- Verify the server can reach the API: `curl -s https://monitor.yourdomain.com/api/healthz`

### Database issues
- Verify PostgreSQL is running: `docker compose ps`
- Check connection: `docker compose exec postgres psql -U monitor -d site_monitor -c "SELECT 1;"`
- Check disk space: `df -h`

---

## Project Structure

```
site-monitor/
├── artifacts/
│   ├── api-server/              # API server + monitoring worker
│   │   └── src/
│   │       ├── middleware/auth.ts    # JWT authentication
│   │       ├── services/monitor.ts  # 60s site check loop
│   │       ├── services/email.ts    # SMTP email alerts
│   │       ├── services/magento.ts  # Magento sync (5m loop, pagination, auto-token)
│   │       └── routes/
│   │           ├── sites.ts         # Site monitoring endpoints
│   │           ├── servers.ts       # Server vitals endpoints
│   │           └── magento.ts       # Magento order/cart endpoints
│   └── mobile/                  # Mobile app (Expo/React Native)
│       ├── app/
│       │   ├── login.tsx            # Login screen
│       │   └── (tabs)/
│       │       ├── index.tsx        # Dashboard (site status)
│       │       ├── history.tsx      # Check history
│       │       ├── alerts.tsx       # Alert history
│       │       ├── servers.tsx      # Server vitals
│       │       ├── store.tsx        # Magento orders & carts
│       │       └── settings.tsx     # SMTP, auth, config
│       └── contexts/AuthContext.tsx
├── agent/
│   ├── monitor-agent.js         # Server vitals agent (install on each server)
│   └── monitor-agent.service    # Systemd service file
├── lib/
│   ├── db/                      # Database schema (Drizzle ORM)
│   │   └── src/schema/
│   │       ├── index.ts             # Main schema exports
│   │       ├── magento.ts           # Magento orders/carts/sync tables
│   │       └── servers.ts           # Server vitals tables
│   ├── api-spec/                # OpenAPI specification
│   ├── api-client-react/        # Generated API hooks
│   └── api-zod/                 # Generated validation schemas
└── scripts/
    └── src/seed-sites.ts        # Database seed script
```

## License

Private — Internal use only.
