#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./install.sh <API_URL> <API_KEY>"
  echo "  Example: ./install.sh https://monit.lovefurniture.ie sm_abc123..."
  exit 1
fi

API_URL="$1"
API_KEY="$2"

echo "Installing Site Monitor Agent..."

sudo mkdir -p /opt/monitor-agent
sudo cp monitor-agent.js /opt/monitor-agent/

sudo tee /opt/monitor-agent/.env > /dev/null << EOF
MONITOR_API_URL=${API_URL}
MONITOR_API_KEY=${API_KEY}
MONITOR_INTERVAL=30
EOF

sudo chmod 600 /opt/monitor-agent/.env

sudo cp monitor-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monitor-agent
sudo systemctl start monitor-agent

echo ""
echo "Agent installed and running!"
echo "  Check status: sudo systemctl status monitor-agent"
echo "  View logs:    sudo journalctl -u monitor-agent -f"
