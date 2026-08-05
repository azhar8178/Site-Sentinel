---
name: Additive schema migrations
description: Production migration behavior when existing tables predate current application columns
---

Schema startup migrations must define new columns in the initial table creation and separately check and add them for existing tables. `CREATE TABLE IF NOT EXISTS` succeeds without changing an already-created table.

**Why:** A production deployment reported migration success while the API failed because an existing `alerts` table lacked a newer nullable column selected by the application.

**How to apply:** For every schema evolution, pair the fresh-table definition with an idempotent `information_schema.columns` check and additive `ALTER TABLE ... ADD COLUMN`; verify the startup log includes the additive step when upgrading old volumes.