# gms (`@barrelsgd/web-gms`) — Claude context

Port **3003**. Public weather dashboard for Spice Island (Grenada) — daily forecasts, weather conditions, alerts, and news.

**Design-system role: public web reference app.** Lowest-drift baseline — prototype and validate new public-facing patterns here first before reusing them elsewhere. See `docs/design-workflow.md`.

## Auth pattern

Delegates to `web-auth` (`:3000`) via redirect — does not handle sign-in itself.

## No database

Static/mock data currently (`src/lib/mock-data.ts`, `src/lib/forecast-data.ts`,
`src/lib/events.ts`). No Drizzle, no direct DB access. The exception is the live
CAP warnings feed via `src/lib/cap.ts` — `/warnings`, `/warnings/cyclone`,
`/warnings/marine`, `/warnings/tsunami` and `/marine/small-craft` render real
alerts. When that feed is unreachable those pages say so; they must never render
an empty list as "no warnings in effect".

## Routes

```
src/app/
  (weather)/                  ← hero + alerts-panel surface
    page.tsx                  ← home: today's weather
    forecasts/page.tsx        ← today's weather at /forecasts
    forecasts/[date]/page.tsx ← weather for a specific date
    layout.tsx                ← shared weather layout
  (pages)/                    ← standing content pages
    layout.tsx                ← plain max-w-7xl container
    warnings/ forecasts/ marine/ observations/ aviation/
    sectors/ climate/ events/ resources/ about/
    almanac/ help/ media/ subscribe/ regional/ app-guide/
  layout.tsx                  ← root layout
  api/health/route.ts
```

`(pages)` routes are static content built from the components in
`src/components/pages/`. Pages whose product is not yet issued from the forecast
system must render `<PlaceholderNotice />` — sample weather figures must never
read as an operational product.

`NAV_SECTIONS` in `src/lib/nav-sections.ts` is the single source for both the
drawer and the desktop masthead. `src/lib/nav-sections.test.ts` walks `src/app`
and fails if any nav link has no route behind it — add the page before the link.

## Key dependencies (unique to this app)

- `@headlessui/react` — nav drawer and accordion. **Migration target:** move to `@base-ui-components/react` (already in `@barrelsgd/ui`) when refactoring. Do not add new `@headlessui/react` usage.
- `lucide-react` — icons (migrated off `@heroicons/react`)

## Special conventions

- Forecast components are static per-day files in `src/components/forecasts/` — not generated dynamically. Date-based routing maps to these components via `src/lib/forecast-days.ts`.
- `src/lib/utils.ts` contains date utilities shared across components.
- Keep `@headlessui/react` usage isolated to existing components — new interactive components should use Base UI primitives from `@barrelsgd/ui`.
