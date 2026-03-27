# Self-Hosted Deployment Guide

## Prerequisites

- Ubuntu/Debian server (EC2, DigitalOcean, etc.)
- Docker and Docker Compose installed
- A domain name (optional but recommended for HTTPS)

## Quick Start

### 1. Clone the project

```bash
git clone <your-repo-url> site-monitor
cd site-monitor
```

### 2. Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```bash
# Generate a secure JWT secret
openssl rand -hex 32
# Paste the output as JWT_SECRET value

# Set a strong database password
# Add your Magento credentials
nano .env
```

### 3. Build and start

```bash
docker-compose up -d --build
```

The first build may take a few minutes (it builds both the API server and the web dashboard).

Check status:

```bash
docker-compose ps
docker-compose logs api
```

You should see "Server listening" and "Migration completed successfully" in the logs.

### 4. Create your admin account

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-secure-password"}'
```

The first user is automatically an admin.

### 5. Verify

```bash
curl http://localhost:8080/api/healthz
```

Should return `{"status":"ok"}`.

### 6. Access the web dashboard

The API binds to `127.0.0.1:8080` by default for security — it is only accessible from the server itself until you set up Nginx (see below). The web dashboard is bundled with the API and served automatically from the same port.

## Setting Up Nginx (Required for External Access)

### 1. Install Nginx and Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/site-monitor
sudo ln -s /etc/nginx/sites-available/site-monitor /etc/nginx/sites-enabled/

# Edit the server_name to match your domain
sudo nano /etc/nginx/sites-available/site-monitor

# Remove default site if present
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl restart nginx
```

### 3. Get SSL Certificate

```bash
sudo certbot --nginx -d monitor.yourdomain.com
```

Certbot will automatically configure HTTPS and set up auto-renewal.

## Server Agent Setup

To monitor server vitals (CPU, RAM, disk), install the agent on each server you want to monitor:

### 1. Register the server (from the app Settings or via API)

```bash
# Login first
TOKEN=$(curl -s -X POST http://your-server:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' | jq -r .token)

# Register a server
curl -X POST http://your-server:8080/api/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Production Server", "hostname": "prod.example.com"}'
```

Note the `apiKey` from the response.

### 2. Install the agent on the target server

```bash
scp agent/monitor-agent.js agent/install.sh user@target-server:/tmp/
ssh user@target-server "cd /tmp && sudo bash install.sh http://your-monitor:8080 <api-key>"
```

## Updating

```bash
cd site-monitor
git pull
docker-compose up -d --build
```

The migration script runs automatically on startup, so database changes are applied on each deploy.

## Troubleshooting

**API returns 500 errors:**
Check logs: `docker-compose logs api`

**Database connection refused:**
Make sure postgres is healthy: `docker-compose ps`

**Magento data not showing:**
Check your MAGENTO_API_TOKEN has the required permissions:
- `Magento_Sales::actions_view` (for orders)
- `Magento_Cart::manage` (for carts)

**Can't access from browser:**
Make sure port 8080 (or 80/443 with Nginx) is open in your security group/firewall.

## APK Build (Android)

Once the web deployment is stable and you've confirmed the API URL:

1. Install EAS CLI: `npm install -g eas-cli`
2. Log in to Expo: `eas login`
3. Update the API URL in `artifacts/mobile/utils/getBaseUrl.ts` to point to your production server
4. Build the APK:
```bash
cd artifacts/mobile
eas build --platform android --profile preview
```
5. Download the `.apk` from the build URL provided by EAS

For Play Store distribution, use `--profile production` instead.
