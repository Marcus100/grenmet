# spicewx (`@grenmet/web-spicewx`) — Claude context

Port **3003**. Public weather dashboard for Spice Island (Grenada) — daily forecasts, weather conditions, alerts, and news.

**Design-system role: public web reference app.** Lowest-drift baseline — prototype and validate new public-facing patterns here first before reusing them elsewhere. See `docs/design-workflow.md`.

## Auth pattern

Delegates to `web-auth` (`:3000`) via redirect — does not handle sign-in itself.

## No database

Static/mock data currently (`src/lib/mock-data.ts`, `src/lib/forecast-data.ts`). No Drizzle, no direct DB access.

## Routes

```
src/app/
  (weather)/
    page.tsx          ← today's weather (default)
    [date]/page.tsx   ← weather for a specific date
    layout.tsx        ← shared weather layout
  layout.tsx          ← root layout
  api/health/route.ts
```

## Key dependencies (unique to this app)

- `@headlessui/react` — nav drawer and accordion. **Migration target:** move to `@base-ui-components/react` (already in `@grenmet/ui`) when refactoring. Do not add new `@headlessui/react` usage.
- `lucide-react` — icons (migrated off `@heroicons/react`)

## Special conventions

- Forecast components are static per-day files in `src/components/forecasts/` — not generated dynamically. Date-based routing maps to these components via `src/lib/forecast-days.ts`.
- `src/lib/utils.ts` contains date utilities shared across components.
- Keep `@headlessui/react` usage isolated to existing components — new interactive components should use Base UI primitives from `@grenmet/ui`.
