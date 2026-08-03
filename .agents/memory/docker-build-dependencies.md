---
name: Docker build dependencies
description: Constraints for building the Site Sentinel Docker image in limited-storage environments
---

Docker builds for this project should install only the workspace packages needed by the API server and web dashboard. The Expo/mobile and mockup-sandbox packages are not part of the image and can exhaust the builder filesystem when included in a root workspace install.

**Why:** The full workspace install pulled the React Native/Expo tree and failed with `ERR_PNPM_ENOSPC`. Filtering the API/dashboard workspaces allowed the image to build successfully.

**How to apply:** Keep Docker dependency installation scoped with pnpm workspace filters. Keep the dashboard manifest limited to packages imported by its source; unused UI-generator dependencies add avoidable build pressure.