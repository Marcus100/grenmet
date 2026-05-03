FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk upgrade --no-cache && corepack enable pnpm

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/admin-gms/package.json apps/web/admin-gms/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/hr/package.json apps/web/hr/
COPY apps/web/hurricaneplan/package.json apps/web/hurricaneplan/
COPY apps/web/spicewx/package.json apps/web/spicewx/
COPY apps/web/wxproducts/package.json apps/web/wxproducts/
COPY apps/web/wxwatch/package.json apps/web/wxwatch/
COPY apps/web/salesbus/package.json apps/web/salesbus/
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm exec turbo run build --filter=@grenmet/web-wxwatch
RUN mkdir -p apps/web/wxwatch/public

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/wxwatch/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/wxwatch/.next/static ./apps/web/wxwatch/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/wxwatch/public ./apps/web/wxwatch/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/wxwatch/drizzle ./apps/web/wxwatch/drizzle
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/wxwatch/scripts ./apps/web/wxwatch/scripts

RUN printf '#!/bin/sh\nset -e\nnode apps/web/wxwatch/scripts/migrate.mjs\nexec node apps/web/wxwatch/server.js\n' > /entrypoint.sh \
    && chmod +x /entrypoint.sh

USER nextjs
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["/entrypoint.sh"]
