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

## Data

- Frontend-only for now: fixtures behind async functions in `src/data/`
  (`events.ts` for the console, `discovery.ts` for public/community). Keep call
  sites async so a FastAPI source can replace fixtures without UI changes.
- Demo event dates are relative to "now"; tests pass a fixed `now`.
- Interactive pieces (RSVP, follow, connect, messages, editor save) hold local
  state only and must say so in the UI until a backend exists.

## Rules

- Default to Server Components; never pass functions (including icon
  components) from a Server Component to a Client Component.
- Use `@barrelsgd/ui` primitives and the `--events-*` / semantic tokens in
  `src/app/globals.css`; no hardcoded colours in components.
- Public prices show `EC$`; times are Grenada local (`src/lib/datetime.ts`).
- Social safety: direct messages only between accepted connections or shared
  group members (`canMessage`); every person surface offers report and block.
- Resident event suggestions are reviewed before publication.
- Treat settlement, exceptions, offline readiness, and auditability as primary
  organiser information rather than secondary reports.
