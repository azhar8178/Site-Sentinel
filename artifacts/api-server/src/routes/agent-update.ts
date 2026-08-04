import { Router, type IRouter } from "express";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "crypto";

const router: IRouter = Router();

const AGENT_VERSION = "3.5.0";

function getAgentScript(): { content: string; hash: string } | null {
  const paths = [
    resolve(process.cwd(), "agent", "monitor-agent.js"),
    resolve(process.cwd(), "..", "agent", "monitor-agent.js"),
    resolve("/app", "agent", "monitor-agent.js"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex").substring(0, 12);
      return { content, hash };
    }
  }
  return null;
}

router.get("/agent/version", (_req, res) => {
  const script = getAgentScript();
  res.json({
    version: AGENT_VERSION,
    hash: script?.hash || "unknown",
  });
});

router.get("/agent/script", (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    res.status(401).json({ error: "x-api-key header required" });
    return;
  }

  const script = getAgentScript();
  if (!script) {
    res.status(404).json({ error: "Agent script not found" });
    return;
  }

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("X-Agent-Version", AGENT_VERSION);
  res.setHeader("X-Agent-Hash", script.hash);
  res.send(script.content);
});

router.get("/agent/install", (_req, res) => {
  const installScript = `#!/bin/bash
set -e

MONITOR_API_URL="\${1:?Usage: install.sh <API_URL> <API_KEY>}"
MONITOR_API_KEY="\${2:?Usage: install.sh <API_URL> <API_KEY>}"
MONITOR_API_URL="\${MONITOR_API_URL%/}"
MONITOR_OPENSEARCH_URL="\${3:-https://vpc-magento-prod-nzaysstzukhdmqqtuhh6be2use.eu-west-2.es.amazonaws.com}"
MONITOR_OPENSEARCH_REGION="\${4:-eu-west-2}"
MONITOR_OPENSEARCH_AUTH="\${5:-none}"
MONITOR_WAF_REGION="\${6:-eu-west-2}"
MONITOR_WAF_WEB_ACL_NAME="\${7:-CreatedByALB-magento-prod-ALB}"
MONITOR_WAF_LOG_GROUP="\${8:-aws-waf-logs-magento-prod}"
INSTALL_DIR="/opt/monitor-agent"

echo "Installing Site Sentinel Monitor Agent..."

sudo mkdir -p "\$INSTALL_DIR"

echo "Downloading agent script..."
TMP_AGENT="\$(mktemp)"
trap 'rm -f "\$TMP_AGENT"' EXIT
sudo curl -fsS "\$MONITOR_API_URL/api/agent/script" \\
  -H "x-api-key: \$MONITOR_API_KEY" \\
  -o "\$TMP_AGENT"
if ! sudo grep -q '^#!/usr/bin/env node$' "\$TMP_AGENT"; then
  echo "Downloaded agent script failed validation; refusing to install it."
  exit 1
fi
sudo install -m 755 "\$TMP_AGENT" "\$INSTALL_DIR/monitor-agent.js"

sudo tee "\$INSTALL_DIR/.env" > /dev/null <<EOF
MONITOR_API_URL=\$MONITOR_API_URL
MONITOR_API_KEY=\$MONITOR_API_KEY
MONITOR_INTERVAL=30
MONITOR_OPENSEARCH_URL=\$MONITOR_OPENSEARCH_URL
MONITOR_OPENSEARCH_REGION=\$MONITOR_OPENSEARCH_REGION
MONITOR_OPENSEARCH_AUTH=\$MONITOR_OPENSEARCH_AUTH
MONITOR_WAF_REGION=\$MONITOR_WAF_REGION
MONITOR_WAF_WEB_ACL_NAME=\$MONITOR_WAF_WEB_ACL_NAME
MONITOR_WAF_LOG_GROUP=\$MONITOR_WAF_LOG_GROUP
EOF

sudo tee /etc/systemd/system/monitor-agent.service > /dev/null <<EOF
[Unit]
Description=Site Sentinel Monitor Agent
After=network.target

[Service]
Type=simple
EnvironmentFile=\$INSTALL_DIR/.env
ExecStart=/usr/bin/node \$INSTALL_DIR/monitor-agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable monitor-agent
sudo systemctl restart monitor-agent

echo ""
echo "Agent installed and running!"
echo "  Status: sudo systemctl status monitor-agent"
echo "  Logs:   sudo journalctl -u monitor-agent -f"
`;

  res.setHeader("Content-Type", "text/plain");
  res.send(installScript);
});

export default router;
