FROM public.ecr.aws/docker/library/node:24-slim AS builder
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY artifacts/web-dashboard/package.json ./artifacts/web-dashboard/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/api-spec/package.json ./lib/api-spec/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY scripts/package.json ./scripts/package.json
COPY artifacts/mobile/package.json ./artifacts/mobile/package.json
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/web-dashboard/ ./artifacts/web-dashboard/

RUN pnpm --filter @workspace/web-dashboard run build
RUN pnpm --filter @workspace/api-server run build

FROM public.ecr.aws/docker/library/node:24-slim
ENV CI=true NODE_ENV=production
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY artifacts/web-dashboard/package.json ./artifacts/web-dashboard/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/api-spec/package.json ./lib/api-spec/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY scripts/package.json ./scripts/package.json
COPY artifacts/mobile/package.json ./artifacts/mobile/package.json
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/package.json

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/scripts ./artifacts/api-server/scripts
COPY --from=builder /app/artifacts/web-dashboard/dist ./artifacts/web-dashboard/dist
COPY --from=builder /app/lib/db ./lib/db
COPY agent ./agent

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node artifacts/api-server/scripts/migrate.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
