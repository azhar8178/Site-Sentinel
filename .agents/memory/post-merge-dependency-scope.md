---
name: Post-merge dependency scope
description: The workspace dependency boundary used by automatic post-merge setup
---

Automatic post-merge setup installs only the API server and web dashboard workspace closures, then runs the database schema push non-interactively. Mobile and mockup tooling is outside this merge path.

**Why:** A full workspace install pulled mobile development tooling and failed at the package firewall even though the merged server/dashboard changes did not need it.

**How to apply:** Keep `scripts/post-merge.sh` scoped with pnpm workspace filters and retain a timeout large enough for a clean frozen install. If a new runtime workspace becomes part of the merge path, add it deliberately rather than reverting to a root install.