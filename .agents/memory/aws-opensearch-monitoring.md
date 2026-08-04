---
name: AWS OpenSearch monitoring
description: How Site Sentinel checks a managed Amazon OpenSearch domain
---

Amazon OpenSearch Service is remote from the monitored EC2 host, even when the EC2 instance runs the application. The agent checks the configured domain's `/_cluster/health` endpoint over HTTPS. VPC domains may allow unsigned read access from the VPC; IAM SigV4 and basic auth remain explicit alternatives. Local `systemctl elasticsearch` and `127.0.0.1:9200` are only the fallback for self-hosted Elasticsearch.

**Why:** The dashboard can show the EC2 server online while reporting OpenSearch red if the agent probes localhost instead of the AWS VPC domain.

**How to apply:** Keep the OpenSearch domain URL, AWS region, and auth mode in the agent environment. Use `none` when the domain policy allows VPC-local read access, `iam` when SigV4 is required, and `basic` only when explicitly configured. The instance must have VPC/DNS/network access to the endpoint. Never store AWS credentials in the dashboard or database.

Agent update URLs must be normalized before appending API paths; a trailing slash can create a double-slash route that returns the dashboard HTML instead of JavaScript. Validate downloaded agent content before replacing the executable.

**Why:** The production custom domain returned a successful HTML fallback for a double-slash script URL, causing Node to fail with `Unexpected token '<'` and systemd to restart continuously.

**How to apply:** Strip trailing slashes from `MONITOR_API_URL`, download to a temporary file, require the Node shebang, then atomically install the validated script.