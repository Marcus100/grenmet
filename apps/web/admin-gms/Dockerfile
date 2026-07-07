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
COPY packages/theme/package.json packages/theme/
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/admin-gms/package.json apps/web/admin-gms/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/hurricaneplan/package.json apps/web/hurricaneplan/
COPY apps/web/spicewx/package.json apps/web/spicewx/
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* vars are baked into the client bundle at build time
ARG NEXT_PUBLIC_API_URL="https://api.barrels.gd"
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ARG RESEND_API_KEY="placeholder"
ARG SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV RESEND_API_KEY=$RESEND_API_KEY
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm exec turbo run build --filter=@grenmet/web-admin
RUN mkdir -p apps/web/admin-gms/public

# ── Migration runner ─────────────────────────────────────────────────────────
# Built as a separate image (target=migrate) and run as a one-off by the compose
# wxwatch-migrate / wxproducts-migrate services. Reuses the builder's full
# node_modules (drizzle-orm + pg + migrator) and the committed drizzle/ SQL.
FROM builder AS migrate
WORKDIR /app
CMD ["sh", "-c", "node apps/web/admin-gms/scripts/migrate-wxwatch.mjs && node apps/web/admin-gms/scripts/migrate-wxproducts.mjs && node apps/web/admin-gms/scripts/migrate-janitorial.mjs && node apps/web/admin-gms/scripts/migrate-transport.mjs"]

FROM node:26-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/admin-gms/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/admin-gms/.next/static ./apps/web/admin-gms/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/admin-gms/public ./apps/web/admin-gms/public

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/admin-gms/server.js"]
