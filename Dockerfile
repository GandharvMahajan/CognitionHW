# Single image for every workspace app: the compose services differ only by command.
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @fintech/db exec prisma generate

FROM base AS web
ENV NODE_ENV=production
RUN pnpm --filter @fintech/web build
