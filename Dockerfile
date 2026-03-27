FROM node:24-slim
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

RUN cd artifacts/mobile && pnpm exec expo export --platform web

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node artifacts/api-server/scripts/migrate.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
