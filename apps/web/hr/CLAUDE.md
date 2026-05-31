# hr (`@grenmet/web-hr`) — Claude context

Port **3006**. HR management app — timesheets, duty rosters, leave applications, shift exchanges, and status reports for airport meteorological staff.

## Auth pattern

Delegates to `web-auth` (`:3000`) via redirect — does not handle sign-in itself.

- Env vars: `AUTH_APP_URL`, `AUTH_API_URL`, `AUTH_API_V1_STR`, `SESSION_COOKIE_NAME`, `AUTH_ALLOWED_RETURN_HOSTS`
- No `@grenmet/auth/server` direct usage — session validation happens upstream

## API consumption

Consumes FastAPI HR endpoints (`/api/v1/hr/`) via `@grenmet/api-client`. Key domains:

- Timesheets — `OfficialTimeSheet.tsx`
- Duty rosters — `MeteorologicalDutyRoster.tsx`
- Leave applications — `LeaveOfAbsenceApplication.tsx`
- Shift exchanges — `ShiftExchangeRequisitionForm.tsx`
- Daily status reports — `DailyAirportStatusReport.tsx`

FastAPI must be running (`pnpm start`) for HR data to load.

## No database

This app has no own DB. All data comes from FastAPI via `@grenmet/api-client`.

## Routes

```
src/app/
  page.tsx              ← main HR dashboard
  api/health/route.ts
```

## Key dependencies (unique to this app)

- `@grenmet/api-client` — generated FastAPI client (React Query hooks + Zod schemas)
- No `drizzle-orm`, no direct DB access

## Testing strategy

Use msw to mock FastAPI HTTP responses — no need to run the full Python backend for tests. See `pnpm-workspace.yaml` catalog for `msw` version.
