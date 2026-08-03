---
name: Docker build dependencies
description: Constraints for building the Site Sentinel Docker image in limited-storage environments
---

Docker builds for this project should install only the workspace packages needed by the API server and web dashboard. The Expo/mobile and mockup-sandbox packages are not part of the image and can exhaust the builder filesystem when included in a root workspace install. Build the dashboard and API in separate stages so their dependency trees do not coexist during installation.

**Why:** The full workspace install pulled the React Native/Expo tree and failed with `ERR_PNPM_ENOSPC`; even the combined API/dashboard filter still exceeded the builder limit. Separate filtered stages now build successfully. Optional dependencies must remain enabled for Vite/Rollup platform binaries and the API's `pg` bundling.

**How to apply:** Keep Docker dependency installation scoped with pnpm workspace filters, build the dashboard bundle outside the constrained Docker builder, and use `pnpm deploy --prod --legacy` to create an API-only runtime bundle. The final runtime stage must not reinstall pnpm or the workspace.