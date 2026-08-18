FROM public.ecr.aws/docker/library/node:24-slim AS web-builder
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/web-dashboard/package.json ./artifacts/web-dashboard/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json

RUN pnpm install --frozen-lockfile --filter @workspace/web-dashboard...

COPY tsconfig.base.json ./
COPY lib/api-client-react/ ./lib/api-client-react/
COPY artifacts/web-dashboard/ ./artifacts/web-dashboard/

RUN pnpm --filter @workspace/web-dashboard run build

FROM public.ecr.aws/docker/library/node:24-slim AS api-builder
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

COPY tsconfig.base.json ./
COPY lib/db/ ./lib/db/
COPY lib/api-zod/ ./lib/api-zod/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build
RUN rm -rf /tmp/runtime \
  && mkdir -p /tmp/runtime/artifacts/api-server \
  && pnpm --filter @workspace/api-server deploy --prod --legacy /tmp/runtime/artifacts/api-server

FROM public.ecr.aws/docker/library/node:24-slim
ENV CI=true NODE_ENV=production

WORKDIR /app

COPY --from=api-builder /tmp/runtime ./
COPY --from=web-builder /app/artifacts/web-dashboard/dist ./artifacts/web-dashboard/dist
COPY agent ./agent

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node artifacts/api-server/scripts/migrate.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
