FROM node:24-slim
ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080
CMD ["node", "artifacts/api-server/dist/index.mjs"]
