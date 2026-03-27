# Site Monitor

A self-hosted monitoring and alerting system for your websites. Checks availability every 60 seconds, sends email alerts when issues are detected, and provides a mobile dashboard for real-time status.

Built for **Love Furniture IE** and **Love Furniture UK** Magento stores.

## What It Does

- Checks your sites every 60 seconds
- Detects downtime, slow responses, and recovery
- Sends email alerts via any SMTP server (Gmail, Microsoft 365, AWS SES, etc.)
- Mobile app (Android APK) for real-time dashboard, alert history, and settings
- Simple username/password authentication
- Per-site configurable slow response thresholds

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Mobile App        │────▶│  API Server      │────▶│  PostgreSQL  │
│   (Android APK)     │     │  (Node.js)       │     │              │
└─────────────────────┘     │                  │     └──────────────┘
                            │  ┌────────────┐  │
                            │  │ Monitor    │  │     ┌──────────────┐
                            │  │ Worker     │──┼────▶│  SMTP Server │
                            │  │ (60s loop) │  │     │  (Email)     │
                            │  └────────────┘  │     └──────────────┘
                            └──────────────────┘
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
EOF
```

Change `changeme_db_password` to a strong password of your choice.

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

Create the Nginx config (replace `monitor.yourdomain.com` with your actual domain):

```bash
sudo tee /etc/nginx/sites-available/site-monitor << 'EOF'
server {
    listen 80;
    server_name monitor.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
curl -s https://monitor.yourdomain.com/api/healthz
# Should return: {"status":"ok"}
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

### Step 9: Build the Android APK

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

### Updating

```bash
cd /opt/site-monitor
git pull
docker compose build api
docker compose up -d api
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

All endpoints except auth require a JWT token in the `Authorization: Bearer <token>` header.

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
│   │       ├── services/monitor.ts  # 60s check loop
│   │       ├── services/email.ts    # SMTP email alerts
│   │       └── routes/              # API endpoints
│   └── mobile/                  # Mobile app (Expo/React Native)
│       ├── app/
│       │   ├── login.tsx            # Login screen
│       │   └── (tabs)/             # Dashboard, History, Alerts, Settings
│       └── contexts/AuthContext.tsx
├── lib/
│   ├── db/                      # Database schema (Drizzle ORM)
│   ├── api-spec/                # OpenAPI specification
│   ├── api-client-react/        # Generated API hooks
│   └── api-zod/                 # Generated validation schemas
└── scripts/
    └── src/seed-sites.ts        # Database seed script
```

## License

Private — Internal use only.
