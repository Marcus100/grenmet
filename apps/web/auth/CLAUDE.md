# auth (`@grenmet/web-auth`) — Claude context

Port **3000**. The sole sign-in/sign-up hub for the entire monorepo. Every other app redirects here for authentication. Does not handle any domain logic — only auth flows.

## Auth pattern

This IS the auth app — it does not delegate to itself. It integrates directly with FastAPI's auth endpoints (`/api/v1/auth/`, `/api/v1/login/`).

- Session helpers: `src/lib/session.ts` — `createSession`, cookie read/write
- Auth config: `src/lib/auth-config.ts`
- Return-to logic: `src/lib/return-to.ts` — `getSafeLocalReturnTo`, validates redirect targets
- Server actions: `src/app/actions.ts` + `src/app/actions-types.ts`

## Routes

```
src/app/
  page.tsx                        ← sign-in form
  signup/page.tsx
  forgot-password/page.tsx
  reset-password/page.tsx
  api/email/render/route.ts       ← internal endpoint: FastAPI calls this to render email templates
  api/health/route.ts
```

## Email render endpoint

`POST /api/email/render` is called **only by FastAPI** (not by browsers) to render React Email templates to HTML. Protected by `EMAIL_RENDER_SECRET` header. Uses `@grenmet/email-templates` package.

## Key conventions

- `AUTH_ALLOWED_RETURN_HOSTS` controls which hosts are valid redirect targets after sign-in. Never redirect to an unvalidated host — always go through `getSafeLocalReturnTo()`.
- `buildSharedSignInUrl()` from `@grenmet/auth/server` is what other apps use to redirect here. Do not construct the URL manually.
- Session cookies use `SESSION_COOKIE_NAME` and are shared across apps via `SESSION_COOKIE_DOMAIN`.

## Key dependencies

- `@grenmet/email-templates` — React Email templates for password reset etc.
- `posthog-node` — server-side PostHog analytics
