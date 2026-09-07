# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk upgrade --no-cache && corepack enable pnpm

FROM base AS dependencies
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/admin-migrations/package.json packages/admin-migrations/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/api-client/package.json packages/api-client/
COPY packages/theme/package.json packages/theme/
COPY packages/gms/package.json packages/gms/
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/gaa-admin/package.json apps/web/gaa-admin/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/docs/package.json apps/web/docs/
COPY apps/web/gms/package.json apps/web/gms/
COPY apps/web/cms/package.json apps/web/cms/
COPY apps/web/events/package.json apps/web/events/
COPY apps/web/mbia/package.json apps/web/mbia/
COPY apps/web/signal/package.json apps/web/signal/
COPY packages/email-templates/package.json packages/email-templates/
COPY packages/mdx/package.json packages/mdx/
RUN HUSKY=0 pnpm install --frozen-lockfile

FROM dependencies AS source

# NEXT_PUBLIC_* vars are baked into the client bundle at build time
ARG NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE="true"
ENV NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE=$NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE
ARG NEXT_PUBLIC_API_URL="https://api.barrels.gd"
ARG NEXT_PUBLIC_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

FROM source AS builder
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN RESEND_API_KEY=build-only-placeholder pnpm exec turbo run build --filter=@barrelsgd/web-gaa-admin
RUN mkdir -p apps/web/gaa-admin/public

# ── Migration runner ─────────────────────────────────────────────────────────
# One-off migrations use source and installed dependencies without a Next.js build.
FROM dependencies AS migration-package
RUN pnpm --filter @barrelsgd/admin-migrations deploy --legacy --prod /migration-runtime

FROM base AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=migration-package /migration-runtime/node_modules ./apps/web/gaa-admin/node_modules
COPY --from=source /app/apps/web/gaa-admin/package.json ./apps/web/gaa-admin/package.json
COPY --from=source /app/apps/web/gaa-admin/scripts ./apps/web/gaa-admin/scripts
COPY --from=source /app/apps/web/gaa-admin/drizzle ./apps/web/gaa-admin/drizzle
COPY --from=source /app/apps/web/gaa-admin/seed ./apps/web/gaa-admin/seed
COPY --from=source /app/apps/web/gaa-admin/src/db ./apps/web/gaa-admin/src/db
USER node
CMD ["sh", "-c", "node apps/web/gaa-admin/scripts/migrate-wxwatch.mjs && node apps/web/gaa-admin/scripts/migrate-wxproducts.mjs && node apps/web/gaa-admin/scripts/migrate-janitorial.mjs && node apps/web/gaa-admin/scripts/migrate-transport.mjs && node apps/web/gaa-admin/scripts/seed-transport.mjs && node apps/web/gaa-admin/scripts/seed-janitorial.mjs && node apps/web/gaa-admin/scripts/verify-databases.mjs"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/gaa-admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/gaa-admin/.next/static ./apps/web/gaa-admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/gaa-admin/public ./apps/web/gaa-admin/public

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/gaa-admin/server.js"]
