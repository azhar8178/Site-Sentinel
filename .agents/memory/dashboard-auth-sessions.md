---
name: Dashboard auth sessions
description: Session-token handling and stale development-browser behavior in the React dashboard
---

The dashboard API client must resolve the bearer token from the current browser session for each request rather than closing over the token captured during an earlier login or reload. When auth-provider code changes during Vite Fast Refresh, a clean dashboard workflow restart may be required to clear stale hook/module state.

**Why:** A healthy authenticated API endpoint was incorrectly presented as an empty/broken alert feed because the browser retained stale session/module state during dashboard development.

**How to apply:** Keep the token getter localStorage-backed, show a specific re-login action for HTTP 401 responses, and restart the active dashboard workflow after auth-context changes instead of relying only on HMR.