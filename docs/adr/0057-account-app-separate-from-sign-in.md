# ADR-0057: A separate account app, `account.barrels.gd`

## Status

Proposed — 2026-11-13. Owner direction of 13 November 2026: keep
`auth.barrels.gd` for signing in, and move the pages for managing a Barrels
account to a new app at `account.barrels.gd`. Nothing here is built yet. The
first feature that needs it is the profile photo upload screen (#1303); the
photo API itself is app-agnostic and ships first.

## Context

`apps/web/auth` was set up as "the sole sign-in/sign-up hub … only auth flows"
(`apps/web/auth/AGENTS.md`). It now also holds the pages a person uses to
manage their account and some consumer features:

- **Sign-in flows:** sign-in, sign-up, forgot and reset password, email
  verification, activation, sign-in with an emailed code, Google
  confirmation, single sign-on hand-off (`continue`, ADR-0017), the access
  request page, signed-out, and the emailed organisation invitation link
  (`organisations/accept`).
- **Account management:** security (password and two-step sign-in, recovery
  codes), sessions, my organisations, my apps (`apps`).
- **Consumer features:** Events tickets (`tickets`) and the rewards passport
  (`rewards`).
- **Organisation administration:** the organisation rewards admin
  (`organisations/[organisationId]/rewards/...`).

Every new account feature (profile photo, name and contact details,
notification preferences) would land in the sign-in app too.

## Evidence

- **Fact (high):** the page list above, from `apps/web/auth/src/app` on
  `origin/dev`, 13 November 2026.
- **Fact (high):** ADR-0043 decision 6 allows a new host "only when a
  product has a distinct audience, auth/session model, branding or
  deployment"; decision 4 makes cookies host-only (`Domain=` never set), so a
  second host signs in through single sign-on (`continue`, ADR-0017) like
  every other app.
- **Fact (high):** port 3018 was reserved for an unspecified
  `@barrelsgd/web-app` with no recorded plan (`docs/ports.md`).
- **Best practice (medium):** large identity providers keep the sign-in
  surface separate from account management (for example Google's
  `accounts.google.com` and `myaccount.google.com`). The sign-in surface stays
  small, strict and rarely changed, while account pages change often and
  carry richer UI.
- **Interpretation (medium):** the sign-in pages handle passwords, codes and
  return-to targets; every unrelated page in the same app widens what a
  mistake there can reach and makes a strict Content Security Policy harder
  to keep.

## Options considered

1. **Keep everything in `auth` (status quo).** No new app or deployment. The
   sign-in app keeps growing with unrelated features, and its risk surface and
   release churn grow with it.
2. **New app `account.barrels.gd` for account management (chosen).** Sign-in
   flows stay in `auth`. Account pages move out in small PRs. Costs one more
   app to build, deploy and monitor (one container on the droplet or, if it
   needs no server code, a static build).
3. **Fold account pages into `admin` or `gms`.** Those hosts serve staff
   audiences (ADR-0043 decision 2); every Barrels account, including Events
   customers, needs account pages, so this mixes audiences.

## Decision

Adopt option 2.

- **`auth.barrels.gd` (`apps/web/auth`, port 3000) keeps only the sign-in
  flows** listed above, including the emailed invitation link, because it
  works before the person has a session on any other host.
- **`account.barrels.gd` (`apps/web/account`, `@barrelsgd/web-account`, port
  3018,** the unused `@barrelsgd/web-app` reservation, owner decision 13
  November 2026**)** holds a person's account: profile (name, profile photo), security
  (password, two-step sign-in, recovery codes), sessions, my organisations,
  and my apps. It signs in through `continue` like any other app, and asks for
  the password or a code again before security changes, as `auth` does today.
- **Events tickets and the rewards passport** move to `account` and stay there
  (owner decision 13 November 2026), like the orders page of a large
  platform's account: one place where a person manages everything.
- **The organisation rewards admin** moves to `account` under my organisations,
  next to the organisation it administers.
- Old `auth` URLs redirect to the new pages for at least one release.

## Migration

One small PR each, in order:

1. Scaffold `apps/web/account` (Next.js, the `@barrelsgd/auth` session package,
   the UI and theme packages) on port 3018 (`docs/ports.md`), a
   Dockerfile and compose service, a Traefik route on staging, the sign-in
   return-host allowlist and CORS origins. The home page shows the profile with
   the photo upload (#1303).
2. Move security and sessions, with redirects from `auth`.
3. Move my organisations and my apps, then the organisation rewards admin.
4. Move tickets and rewards.
5. Production: DNS, certificate and a Better Stack monitor, then trim
   `apps/web/auth/AGENTS.md` back to sign-in flows.

## Consequences

- The sign-in app stays small enough to review closely and to give a strict
  Content Security Policy; account features ship without touching it.
- One more app to build, deploy, monitor and keep in the port and hostname
  registries.
- People sign in once more on first visit to `account` (single sign-on makes
  it a redirect, not a new password entry).
- Links to old `auth` pages in emails and other apps must change; the
  redirects cover the gap.

## Owner answers (13 November 2026)

- Tickets and rewards stay in `account` for good; no separate consumer app is
  planned.
- Port 3018, reserved for `@barrelsgd/web-app` with no recorded plan, becomes
  `@barrelsgd/web-account`.
