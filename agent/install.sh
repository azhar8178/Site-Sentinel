#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./install.sh <API_URL> <API_KEY>"
  echo "  Example: ./install.sh https://monit.lovefurniture.ie sm_abc123..."
  exit 1
fi

API_URL="${1%/}"
API_KEY="$2"
OPENSEARCH_URL="${MONITOR_OPENSEARCH_URL:-https://vpc-magento-prod-nzaysstzukhdmqqtuhh6be2use.eu-west-2.es.amazonaws.com}"
OPENSEARCH_REGION="${MONITOR_OPENSEARCH_REGION:-eu-west-2}"
OPENSEARCH_AUTH="${MONITOR_OPENSEARCH_AUTH:-none}"
WAF_REGION="${MONITOR_WAF_REGION:-eu-west-2}"
WAF_WEB_ACL_NAME="${MONITOR_WAF_WEB_ACL_NAME:-CreatedByALB-magento-prod-ALB}"
WAF_LOG_GROUP="${MONITOR_WAF_LOG_GROUP:-aws-waf-logs-magento-prod}"

echo "Installing Site Monitor Agent..."

sudo mkdir -p /opt/monitor-agent
sudo cp monitor-agent.js /opt/monitor-agent/

sudo tee /opt/monitor-agent/.env > /dev/null << EOF
MONITOR_API_URL=${API_URL}
MONITOR_API_KEY=${API_KEY}
MONITOR_INTERVAL=30
MONITOR_OPENSEARCH_URL=${OPENSEARCH_URL}
MONITOR_OPENSEARCH_REGION=${OPENSEARCH_REGION}
MONITOR_OPENSEARCH_AUTH=${OPENSEARCH_AUTH}
MONITOR_WAF_REGION=${WAF_REGION}
MONITOR_WAF_WEB_ACL_NAME=${WAF_WEB_ACL_NAME}
MONITOR_WAF_LOG_GROUP=${WAF_LOG_GROUP}
EOF

sudo chmod 600 /opt/monitor-agent/.env

sudo cp monitor-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monitor-agent
sudo systemctl restart monitor-agent

echo ""
echo "Agent installed and running!"
echo "  Check status: sudo systemctl status monitor-agent"
echo "  View logs:    sudo journalctl -u monitor-agent -f"
