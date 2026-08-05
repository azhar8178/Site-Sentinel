---
name: Deployment identity scope
description: Scope for idempotent deployment webhook identities
---

A deployment provider’s external event ID is only unique within its monitored system. The idempotency key must include the provider, deployment system, and provider event ID.

**Why:** Magento and Odoo can independently emit the same numeric deployment or pipeline IDs; a global provider-plus-ID key causes one system’s event to overwrite the other.

**How to apply:** Use `(provider, system_id, provider_deployment_id)` for the database uniqueness constraint and webhook upsert target. Retries for one system still update one row, while matching IDs across systems create separate history entries.