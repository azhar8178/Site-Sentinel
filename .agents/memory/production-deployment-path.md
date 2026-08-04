---
name: Production deployment path
description: The live self-hosted Site Sentinel deployment location and safe update constraint
---

The live dashboard and API are served by Docker Compose from the production checkout on the monitoring host. Updates must preserve that checkout's existing `.env` and unrelated local changes; do not reset or pull blindly.

**Why:** The Replit workspace and the self-hosted production server are separate copies. Updating the workspace does not change `monit.lovefurniture.ie`, and the production checkout may contain local operational changes.

**How to apply:** When a feature is ready for this self-hosted deployment, transfer only the intended source or built dashboard artifacts, rebuild the API image, recreate the API container, and verify the public bundle and container health.