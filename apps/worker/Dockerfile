# syntax=docker/dockerfile:1
# SEPscope worker. Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t sepscope-worker .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Download every dependency from the lockfile alone, so this layer is rebuilt
# only when dependencies change, not on every source edit.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# Install, build and package just this app and the workspace packages it uses.
FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "@sepscope/worker..."
RUN pnpm --filter "@sepscope/worker..." build
# A self-contained copy with production dependencies only.
RUN pnpm --filter @sepscope/worker deploy --prod /out

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production ANCHORS_FILE=/app/anchors.json
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node anchors.json ./anchors.json
USER node
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_HEALTH_PORT||8081)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Node handles SIGTERM itself (graceful shutdown); run with an init (compose: init: true) to reap children.
CMD ["node", "dist/bin.js"]
