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
- The `/dash` console acts for one organiser: the member's choice is the host-only `events_organiser` cookie (`data/organiser-choice.ts`, set by the `switchOrganiser` action from `OrganiserSwitcher`, shown when they manage several) and is sent as `?organiser=`.
- `/dash/events` uses the organiser API (`/manage`); members without organiser
  access see `NoOrganiserAccess`, which hosts `OrganiserRequestForm` (the `requestOrganiser` action creates an unverified organiser they own; `/dash` shows an awaiting-verification notice until a moderator verifies it). The `/dash` overview uses the same listings
  (counts and titles). Sales and settlement have no API yet, so they are
  "available when ticketing launches" empty states, never figures. The listing editor
  shows the listing's History (`ActivityPanel`, `getListingActivity`). No page
  renders the demo fixtures in `src/data/fixtures.ts`.
- **Images (F8):** the organiser logo (`OrganiserLogo` on the `/dash` overview) and the listing cover (`EventEditor`) use `ImageUpload`: the `startUpload` action presigns through `POST /storage/uploads` (with `X-Barrels-Organisation` from the organiser's `organisationId`), the browser PUTs the file to storage, `finishUpload` confirms, then the file id is saved with the listing or `saveOrganiserLogo`. Stored images render via the same-origin `/files/{id}` route (proxy of the API's cached public redirect); never put a bucket URL in a page. Uploads need an organisation-linked organiser and configured storage (the API's 503 "Uploads are not configured" is shown as is). Public pages do not render the images yet.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
