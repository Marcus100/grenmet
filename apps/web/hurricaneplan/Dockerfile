FROM node:26-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS base
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
COPY apps/web/hurricaneplan/package.json apps/web/hurricaneplan/
COPY apps/web/spicewx/package.json apps/web/spicewx/
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ARG SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm exec turbo run build --filter=@grenmet/web-hurricaneplan
RUN mkdir -p apps/web/hurricaneplan/public

FROM node:26-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hurricaneplan/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hurricaneplan/.next/static ./apps/web/hurricaneplan/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hurricaneplan/public ./apps/web/hurricaneplan/public

USER nextjs
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/hurricaneplan/server.js"]
