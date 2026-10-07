# Barrels Events

Port **3009**. Package: `@barrelsgd/web-events`. Design lane:
`docs/design/events.md` (read before UI work).

## Product boundary

- `/` — public discovery and community: home, calendar (`/events`), event
  pages, groups and meetups, profiles, network and messages. Mobile-first.
- `/dash` — the organiser console where promoters build and customise events.
  Desktop-first with a usable responsive summary.
- Keep attendee ticket purchase, staff scanning, Bingo, and the in-event
  companion as distinct experiences.
- The canonical organiser loop is event setup → ticket sale → admission →
  settlement.

## Data and auth

- Public and community data comes from the Events API (`/api/v1/events/*`):
  reads in `src/data/events-api.ts` (server-only), writes in `src/data/actions.ts`
  (server actions), snake_case → domain mapping in `src/data/api-mappers.ts`.
  Pure helpers (date windows, filter parsing) stay in `src/data/discovery.ts`.
  Never hand-write API types; use `@barrelsgd/api-client` and `lib/api.ts`
  (`apiOptions` gives a per-request client carrying the member's token).
- Sign-in is app-scoped (ADR-0016): email code via `/auth/email-code/*` route
  handlers, host-only `events_session` cookie, no shared domain or SSO with
  other apps. `lib/session.ts` `getSession()` exchanges it for an Events token;
  `data/viewer.ts` gives `getViewer()` (guest stand-in when signed out) and
  `requireViewer(returnTo)` for member pages.
- Client components run writes through `useMemberAction`; visitors are sent to
  `/sign-in?returnTo=…`. Expected 4xx show the API's message; others go to Sentry.
- A 404 from the API is `null`; any other read failure throws to `error.tsx`.
- `/dash/events` uses the organiser API (`/manage`); members without organiser
  access see `NoOrganiserAccess`. The `/dash` overview (sales, settlement,
  readiness) is still demo fixtures in `src/data/fixtures.ts` — the API has no
  ticketing or settlement yet; keep it labelled as demo.
- Tests build events with `src/test/factories.ts`; never reintroduce runtime
  fixtures for public data.
- Deployment requires `EVENTS_DB_PASSWORD`; the shared runtime renderer provisions the Events URL and backups include its database. Keep API/auth workspace sources in the web Docker build.

## Rules

- Default to Server Components; never pass functions (including icon
  components) from a Server Component to a Client Component.
- Use `@barrelsgd/ui` primitives and the `--events-*` / semantic tokens in
  `src/app/globals.css`; no hardcoded colours in components.
- Public prices show `EC$`; times are Grenada local (`src/lib/datetime.ts`).
- Social safety is enforced by the API (`can_message`, blocks, approval groups);
  the UI only reflects it (`canMessage`, `canSend`). Every person surface offers
  report and block.
- Resident event suggestions are reviewed before publication.
- Treat settlement, exceptions, offline readiness, and auditability as primary
  organiser information rather than secondary reports.
