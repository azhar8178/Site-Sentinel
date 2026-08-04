---
name: Incident log safety
description: The security and retention boundary for server log collection and AI incident analysis
---

Incident analysis uses only fixed service log sources and recent journal/kernel entries. The agent redacts common credentials and personal data, caps each source and the full payload, stores a short rolling window, and the API sends only that bounded snapshot plus telemetry to the model.

**Why:** Unrestricted remote log access can expose credentials, customer data, or create an unsafe command-execution path. A bounded snapshot is sufficient for performance diagnosis while keeping the monitoring system safer.

**How to apply:** New log sources must be explicitly allowlisted, sanitized, size-limited, and covered by the retention cleanup before being included in the AI prompt or dashboard raw-log viewer.