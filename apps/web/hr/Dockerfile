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
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm exec turbo run build --filter=@grenmet/web-hr
RUN mkdir -p apps/web/hr/public

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hr/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hr/.next/static ./apps/web/hr/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/hr/public ./apps/web/hr/public

USER nextjs
EXPOSE 3006
ENV PORT=3006
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/hr/server.js"]
