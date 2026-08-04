#!/bin/bash
set -euo pipefail

# The mobile workspace brings in native tooling that is not needed for the
# server/dashboard merge path and may be unavailable behind the package
# firewall. Install only the workspaces used by the running web application,
# plus their workspace dependencies.
pnpm install --frozen-lockfile \
  --filter @workspace/api-server... \
  --filter @workspace/web-dashboard...

# Keep schema setup unattended because post-merge runs with stdin closed.
pnpm --filter @workspace/db push --force
