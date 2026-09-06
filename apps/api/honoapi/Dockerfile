FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk upgrade --no-cache && corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/honoapi/package.json apps/api/honoapi/
COPY apps/web/auth/package.json apps/web/auth/
COPY apps/web/docs/package.json apps/web/docs/
COPY apps/web/events/package.json apps/web/events/
COPY apps/web/gaa-admin/package.json apps/web/gaa-admin/
COPY apps/web/gms/package.json apps/web/gms/
COPY apps/web/mbia/package.json apps/web/mbia/
COPY apps/web/signal/package.json apps/web/signal/
COPY packages/api-client/package.json packages/api-client/
COPY packages/auth/package.json packages/auth/
COPY packages/email-templates/package.json packages/email-templates/
COPY packages/gms/package.json packages/gms/
COPY packages/mdx/package.json packages/mdx/
COPY packages/theme/package.json packages/theme/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @barrelsgd/api-hono build
RUN pnpm --filter @barrelsgd/api-hono deploy --legacy --prod /runtime

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
COPY --from=builder --chown=node:node /runtime ./
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
