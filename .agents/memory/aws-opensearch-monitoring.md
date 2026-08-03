---
name: AWS OpenSearch monitoring
description: How Site Sentinel checks a managed Amazon OpenSearch domain
---

Amazon OpenSearch Service is remote from the monitored EC2 host, even when the EC2 instance runs the application. The agent checks the configured domain's `/_cluster/health` endpoint using AWS SigV4 with the EC2 instance role; local `systemctl elasticsearch` and `127.0.0.1:9200` are only the fallback for self-hosted Elasticsearch.

**Why:** The dashboard can show the EC2 server online while reporting OpenSearch red if the agent probes localhost instead of the AWS VPC domain.

**How to apply:** Keep the OpenSearch domain URL, AWS region, and auth mode in the agent environment. The EC2 role needs permission to query the domain and the instance must have VPC/DNS/network access to the endpoint. Never store AWS credentials in the dashboard or database.