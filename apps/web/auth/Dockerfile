# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
RUN apk upgrade --no-cache

# Applications and migrations run directly with Node; keep package managers in builders.
FROM base AS runtime-base
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
          /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM base AS build-base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

FROM build-base AS builder
WORKDIR /app

# Copy all workspace manifests so pnpm resolves the full workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/api-client/package.json packages/api-client/
COPY packages/email-templates/package.json packages/email-templates/
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/gaa-admin/package.json apps/web/gaa-admin/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/docs/package.json apps/web/docs/
COPY apps/web/gms/package.json apps/web/gms/
COPY apps/web/cms/package.json apps/web/cms/
COPY apps/web/events/package.json apps/web/events/
COPY apps/web/mbia/package.json apps/web/mbia/
COPY apps/web/signal/package.json apps/web/signal/
COPY packages/gms/package.json packages/gms/
COPY packages/mdx/package.json packages/mdx/
COPY packages/theme/package.json packages/theme/
RUN HUSKY=0 pnpm install --frozen-lockfile

# Optional build-time env vars (unused by this app but harmless)
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN pnpm exec turbo run build --filter=@barrelsgd/web-auth
RUN mkdir -p apps/web/auth/public

FROM runtime-base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/auth/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/auth/.next/static ./apps/web/auth/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/auth/public ./apps/web/auth/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/auth/server.js"]
