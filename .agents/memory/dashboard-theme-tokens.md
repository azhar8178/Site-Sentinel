---
name: Dashboard theme tokens
description: Dark-mode compatibility and color conventions for the dashboard UI
---

The dashboard supports a site-wide light/dark switch. New UI should use semantic tokens such as `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, and status tokens instead of fixed white/gray utility colors.

**Why:** Several older screens were authored with light-only utility classes, which caused white panels and low-contrast text to appear when dark mode was enabled.

**How to apply:** When touching an existing screen, migrate its surfaces to semantic tokens. The global dark compatibility mappings in the dashboard stylesheet are a safety net for legacy utilities, not a substitute for semantic classes in new code.