# auth (`@barrelsgd/web-auth`) — agent context

Port **3000**. The sole sign-in/sign-up hub for the entire monorepo. Every other app redirects here for authentication. Does not handle any domain logic — only auth flows.

## Auth pattern

This IS the auth app — it does not delegate to itself. It integrates directly with FastAPI's auth endpoints (all under `/api/v1/auth/`).

- Session helpers: `src/lib/session.ts` — `createSession`, cookie read/write
- Auth config: `src/lib/auth-config.ts`
- Return-to logic: `src/lib/return-to.ts` — `getSafeLocalReturnTo`, validates redirect targets
- Server actions: `src/app/actions.ts` + `src/app/actions-types.ts`

## Routes

```text
src/app/
  page.tsx                        ← sign-in form
  signup/page.tsx
  forgot-password/page.tsx
  reset-password/page.tsx
  code/page.tsx                   ← sign in with an emailed one-time code (account session)
  continue/page.tsx               ← single sign-on into another app (ADR-0017): hand off, "Join <app>?", or "no access"
  organisations/page.tsx          ← account tab: my memberships (`GET /organisations/mine`)
  organisations/accept/page.tsx   ← emailed invitation link (`?token=`); a form posts the token in the body (ADR-0022)
  tickets/page.tsx                ← account tab: my Events tickets (`GET /rewards/me/tickets`, read-only)
  rewards/page.tsx                ← account tab: venue check-in form, streak, Passport trails, achievements, stamp cards, redeem (server actions), trust badges
                                     (check-in/passport/achievements/streak: `/rewards/me/*`; sections in `components/rewards-panels.tsx`; a section that fails shows a fallback and calls `reportError`; outcomes are fixed `?notice=` codes — 409 already checked in, 400 one generic invalid/expired message, 503 unavailable. Copy: rewards come from real check-ins, never app opens, no ranking by spend. No leaderboard/challenge/gifting UI until their API ships.)
  organisations/[organisationId]/rewards/page.tsx  ← organisation rewards admin (owner/admin; `X-Barrels-Organisation` on every call): stamp cards (pause/resume), redemption confirm + recent entries/redemptions, venues, trails + stops, achievements, challenges; each section streams behind Suspense with its own empty/error state
                                     (reachable from the Organisations tab only when `canManageRewards` says the API doesn't answer 403; a direct visit explains missing entitlement/role. Server actions in `rewards/actions.ts` return text outcomes via `useActionState` (`components/org-rewards/action-form.tsx`), including the API's 422 text; a 404 on challenges means the flag is off ("not enabled yet"); a redeem 404 is one generic message. The qualifying-source list in `lib/org-rewards-options.ts` mirrors `src/rewards/sources.py` because the API has no catalogue endpoint. No account identities are ever shown.)
  organisations/[organisationId]/rewards/venues/[venueId]/code/page.tsx  ← venue check-in code screen; `components/org-rewards/venue-code-display.tsx` polls every 30 s
  api/organisations/[organisationId]/rewards/venues/[venueId]/qr-token/route.ts  ← proxy only (validate ids, session bearer, `no-store` on every answer); the venue code is a short-lived secret: never in a URL, log or redirect
  api/email/render/route.ts       ← internal endpoint: FastAPI calls this to render email templates
  api/health/route.ts
```

## Email render endpoint

`POST /api/email/render` is called **only by FastAPI** (not by browsers) to render React Email templates to HTML. Protected by `EMAIL_RENDER_SECRET` header. Uses `@barrelsgd/email-templates` package.

## Passwordless sign-up and sign-in (#958)

- `/signup` and the "Continue with email" form share `EmailCodeForm`: one email, then the 6-digit code. The code creates the account on first use, verifies the email and signs the person in, then returns to `returnTo`. There is no password at sign-up and no confirm field anywhere in sign-up, activation or verify-email.
- Password sign-in stays at `/` ("Sign in with a password instead"). Existing password accounts are unchanged.
- The optional name is asked on the account page after sign-in (`NamePrompt`, `saveNameAction`), never at sign-up. The unverified-email banner (`VerifyBanner`) is non-blocking.
- Security shows a Password row; "Add a password" opens `/verify-email`, which sends the password-setup link (`/auth/password/setup`).
- Verification: a code sign-in confirms the email, so passwordless sign-in IS the verification. Password accounts can still send a confirmation link.

Redis (production requirement): the emailed-code send cap and login lockout count in Redis (`REDIS_URL`). Unset, both fail open and nothing is limited. Confirm production sets it before relying on these limits.

Not built, Ask-first (see issues): Turnstile on the code start step (#959); passkeys (WebAuthn) after launch (#960, needs owner approval of a Python WebAuthn dependency, for example `py_webauthn`; no passkey UI until shipped).

## Key conventions

- A page-level form that submits only through `onSubmit` (`SignUpForm`, `change-password-form`) disables its submit until `useHydrated()` (`src/lib/use-hydrated.ts`) is true; before hydration a native submit would be a GET that puts passwords and personal data in the URL. Keep typed values after a refusal (rules: `docs/agents/extended-rules.md`, Form patterns).
- `AUTH_ALLOWED_RETURN_HOSTS` controls which hosts are valid redirect targets after sign-in. Never redirect to an unvalidated host — always go through `getSafeLocalReturnTo()`.
- `buildSharedSignInUrl()` from `@barrelsgd/auth/server` is what other apps use to redirect here. Do not construct the URL manually.
- The account session lives in a host-only `AUTH_SESSION_COOKIE_NAME` cookie (`auth_session`). Other apps never read it; they get their own session through `/continue` (ADR-0017). Signing out here signs out of every app.

- Playwright smoke tests live in `e2e/` (`sign-in.spec.ts`); run them with `pnpm --filter @barrelsgd/web-auth test:e2e` (its config starts the dev server). The repo-wide `pnpm e2e` covers only gms and gaa-admin.

## Key dependencies

- `@barrelsgd/email-templates` — React Email templates for password reset etc.
- `posthog-node` — server-side PostHog analytics

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
