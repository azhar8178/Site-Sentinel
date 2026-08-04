---
name: Agent restart requirement
description: The monitoring agent keeps old code in memory until its systemd service is explicitly restarted.
---

Replacing `/opt/monitor-agent/monitor-agent.js` does not update an already-running Node process.

**Why:** `systemctl enable --now` starts an inactive service but does not reload an active one, so the old collector can continue producing old output after the file is replaced.

**How to apply:** After installing an agent update, run `sudo systemctl restart monitor-agent`, then verify the startup version in `journalctl` before waiting for a new snapshot.