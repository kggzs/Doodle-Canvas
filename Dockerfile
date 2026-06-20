# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci

COPY . .
RUN npm run build
RUN npm --prefix server prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_FRONTEND=true \
    FRONTEND_BASE=/ \
    FRONTEND_DIST_DIR=../../dist \
    STORAGE_ROOT=/app/server/storage \
    STORAGE_BASE_URL=/storage

WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server

RUN mkdir -p /app/server/storage /app/server/logs \
  && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/app.js"]
