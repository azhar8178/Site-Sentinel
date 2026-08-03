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

FROM public.ecr.aws/docker/library/node:24-slim
ENV CI=true NODE_ENV=production
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY --from=api-builder /app/artifacts/api-server/package.json /tmp/api-build-order

RUN pnpm install --frozen-lockfile --prod --filter @workspace/api-server...

COPY --from=api-builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=api-builder /app/artifacts/api-server/scripts ./artifacts/api-server/scripts
COPY artifacts/web-dashboard/dist ./artifacts/web-dashboard/dist
COPY --from=api-builder /app/lib/db ./lib/db
COPY agent ./agent

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node artifacts/api-server/scripts/migrate.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
