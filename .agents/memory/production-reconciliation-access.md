---
name: Production reconciliation access
description: SSH access requirements for one-time production Git reconciliation
---

Use a durable, validated SSH access path for production checkout reconciliation and post-change verification; do not assume a temporary diagnostic key remains available across turns.

**Why:** The live service can remain healthy while the production Git checkout is still stale, but reconciliation is unsafe to declare complete without verifying the server's branch, working tree, and container health.

**How to apply:** Before starting a cleanup or reset, validate the SSH key format and connection, create a full checkout backup plus a separate `.env` backup, then verify Git state and the public health endpoint after the operation.