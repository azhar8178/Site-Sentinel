---
name: Docker build dependencies
description: Constraints for building the Site Sentinel Docker image in limited-storage environments
---

Docker builds for this project should install only the workspace packages needed by the API server and web dashboard. The Expo/mobile and mockup-sandbox packages are not part of the image and can exhaust the builder filesystem when included in a root workspace install. Build the dashboard and API in separate stages so their dependency trees do not coexist during installation.

**Why:** The full workspace install pulled the React Native/Expo tree and failed with `ERR_PNPM_ENOSPC`; even the combined API/dashboard filter still exceeded the builder limit. Separate filtered stages now build successfully. Optional dependencies must remain enabled for Vite/Rollup platform binaries and the API's `pg` bundling.

**How to apply:** Keep Docker dependency installation scoped with pnpm workspace filters, use separate dashboard/API builder stages, and serialize stages before the production install. Keep the dashboard manifest limited to packages imported by its source; the dashboard build now needs about 190 packages instead of the previous 242.