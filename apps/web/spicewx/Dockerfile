FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
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
RUN pnpm exec turbo run build --filter=@grenmet/web-spicewx
RUN mkdir -p apps/web/spicewx/public

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/spicewx/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/spicewx/.next/static ./apps/web/spicewx/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/spicewx/public ./apps/web/spicewx/public

USER nextjs
EXPOSE 3003
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/spicewx/server.js"]
