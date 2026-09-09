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

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/cms/package.json apps/web/cms/
COPY apps/web/docs/package.json apps/web/docs/
COPY apps/web/events/package.json apps/web/events/
COPY apps/web/gaa-admin/package.json apps/web/gaa-admin/
COPY apps/web/gms/package.json apps/web/gms/
COPY apps/web/mbia/package.json apps/web/mbia/
COPY apps/web/signal/package.json apps/web/signal/
COPY packages/admin-migrations/package.json packages/admin-migrations/
COPY packages/api-client/package.json packages/api-client/
COPY packages/auth/package.json packages/auth/
COPY packages/cms-migrations/package.json packages/cms-migrations/
COPY packages/email-templates/package.json packages/email-templates/
COPY packages/gms/package.json packages/gms/
COPY packages/mdx/package.json packages/mdx/
COPY packages/theme/package.json packages/theme/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
RUN HUSKY=0 pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_SITE_URL="http://localhost:3005"
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG SENTRY_PROJECT=""
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_TELEMETRY_DISABLED=1

# Explicit application sources and workspace dependency closure.
COPY packages/tsconfig/ packages/tsconfig/
COPY packages/ui/ packages/ui/
COPY apps/web/mbia/ apps/web/mbia/
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN pnpm exec turbo run build --filter=@barrelsgd/web-mbia
RUN mkdir -p apps/web/mbia/public

FROM runtime-base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/mbia/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/mbia/.next/static ./apps/web/mbia/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/mbia/public ./apps/web/mbia/public

USER nextjs
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/mbia/server.js"]
