---
name: Deployment ingestion
description: The architectural boundary for bringing GitLab deployment history into Site Sentinel
---

Deployment history should remain provider-neutral at the stored record and UI layers. GitLab is the first ingestion provider, using one webhook secret per tracked system, while future GitHub or manual sources can normalize into the same deployment model.

**Why:** Site Sentinel and the monitored Magento/Odoo repositories live on different Git hosts, and webhook delivery provides near-real-time updates without granting Monit users broad GitLab API access or storing broad GitLab credentials.

**How to apply:** Keep webhook secrets hashed at rest and return a rotated secret only once to an authorized administrator. Enforce idempotency with the provider plus external deployment ID, and normalize only the fields needed for history, filtering, and detail views.