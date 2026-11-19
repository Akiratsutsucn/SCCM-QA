# Windows 11 升级排障助手 · 生产镜像（Next.js standalone）
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 W11_DISABLE_JOBS=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build && npx esbuild scripts/import-known-issues.ts --bundle --platform=node --format=cjs --target=node22 --outfile=dist/import.cjs --external:pg --external:@electric-sql/pglite --external:sharp --alias:@=./src

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MEDIA_DIR=/data/media TZ=Asia/Shanghai
RUN groupadd -r app && useradd -r -g app app && mkdir -p /data/media && chown -R app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# 第一批 QA 导入（docker compose exec app node dist/import.cjs --publish）
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/seed ./seed
ENV SEED_FILE=/app/seed/known-issues.json
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
