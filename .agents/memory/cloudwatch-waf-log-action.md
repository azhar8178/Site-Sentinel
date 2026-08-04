---
name: CloudWatch WAF log action
description: The exact AWS JSON target required for CloudWatch Logs FilterLogEvents requests
---

CloudWatch Logs JSON API requests must use the target `Logs_20140328.FilterLogEvents`. The `AWSLogs_20140328.FilterLogEvents` variant returns HTTP 400 with `UnknownOperationException`, even when the IAM role, region, log group, and request signing are otherwise correct.

**Why:** AWS service naming is inconsistent across WAF and CloudWatch Logs; the incorrect target produced a misleading WAF warning with zero events.

**How to apply:** When adding or debugging CloudWatch Logs JSON calls in the monitoring agent, verify the `X-Amz-Target` service prefix against the CloudWatch Logs API name before changing IAM permissions or log-group configuration.