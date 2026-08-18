---
name: Docker build dependencies
description: Constraints for building the Site Sentinel Docker image in limited-storage environments
---

Docker builds for this project should install only the workspace packages needed by the API server and web dashboard. The Expo/mobile and mockup-sandbox packages are not part of the image and can exhaust the builder filesystem when included in a root workspace install. The production image must compile the dashboard from source and copy that generated bundle into the runtime image; never rely on a stale checked-in `dist`.

**Why:** The full workspace install pulled the React Native/Expo tree and failed with `ERR_PNPM_ENOSPC`. Separately, copying an old dashboard `dist` let self-hosted redeploys serve a previous UI even after source changes were pulled. Optional dependencies must remain enabled for Vite/Rollup platform binaries and the API's `pg` bundling.

**How to apply:** Keep Docker dependency installation scoped with pnpm workspace filters for API and dashboard, run both workspace builds inside the builder, copy the builder's dashboard `dist`, and use `pnpm deploy --prod --legacy` to create an API-only runtime bundle. The final runtime stage must not reinstall pnpm or the workspace.