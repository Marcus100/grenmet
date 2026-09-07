FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk upgrade --no-cache && corepack enable pnpm

FROM base AS source
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/api-client/package.json packages/api-client/
COPY packages/theme/package.json packages/theme/
COPY packages/gms/package.json packages/gms/
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/cms/package.json apps/web/cms/
COPY apps/web/gaa-admin/package.json apps/web/gaa-admin/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/docs/package.json apps/web/docs/
COPY apps/web/gms/package.json apps/web/gms/
COPY apps/web/events/package.json apps/web/events/
COPY apps/web/mbia/package.json apps/web/mbia/
COPY apps/web/signal/package.json apps/web/signal/
COPY packages/email-templates/package.json packages/email-templates/
COPY packages/mdx/package.json packages/mdx/
RUN HUSKY=0 pnpm install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @barrelsgd/api-client build

FROM source AS builder
# Build-only placeholders; never copied into the runtime environment.
RUN PAYLOAD_SECRET=build-only-placeholder-not-for-runtime-use DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/gms_cms pnpm exec turbo run build --filter=@barrelsgd/web-cms

# Package only this application's production dependency graph.
FROM source AS migration-package
RUN pnpm --filter @barrelsgd/web-cms deploy --legacy --prod /migration-runtime

FROM base AS migrate
RUN apk add --no-cache postgresql-client
WORKDIR /app/apps/web/cms
ENV NODE_ENV=production
COPY --from=migration-package /migration-runtime/node_modules ./node_modules
# Payload loads the shared TypeScript configuration at migration time.
COPY --from=source /app/packages/tsconfig ./node_modules/@barrelsgd/tsconfig
COPY --from=source /app/apps/web/cms/package.json /app/apps/web/cms/tsconfig.json ./
COPY --from=source /app/apps/web/cms/src ./src
COPY --from=source /app/apps/web/cms/scripts ./scripts
USER node
CMD ["node", "scripts/migrate.mjs"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/cms/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/cms/.next/static ./apps/web/cms/.next/static
USER nextjs
EXPOSE 3006
ENV PORT=3006
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/cms/server.js"]
