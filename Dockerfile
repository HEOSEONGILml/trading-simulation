# ---------- 빌드: 프론트엔드 번들 ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
RUN npm run build -w web

# ---------- 실행: 서버 운영 의존성만 설치 ----------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DB_PATH=/data/results.db
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY server/assets server/assets
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/auth/me').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Node 24는 TypeScript 타입을 제거하고 바로 실행한다
CMD ["node", "server/src/index.ts"]
