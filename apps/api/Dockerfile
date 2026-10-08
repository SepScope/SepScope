# syntax=docker/dockerfile:1
# SEPscope api. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t sepscope-api .

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
RUN pnpm install --frozen-lockfile --offline --filter "@sepscope/api..."
RUN pnpm --filter "@sepscope/api..." build
# A self-contained copy with production dependencies only.
RUN pnpm --filter @sepscope/api deploy --prod /out

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Node handles SIGTERM itself (graceful shutdown); run with an init (compose: init: true) to reap children.
CMD ["node", "dist/bin.js"]
