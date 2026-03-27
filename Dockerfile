FROM node:24-slim AS builder
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=builder /app/artifacts/api-server/dist/ ./artifacts/api-server/dist/
COPY --from=builder /app/artifacts/api-server/scripts/ ./artifacts/api-server/scripts/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node artifacts/api-server/scripts/migrate.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
