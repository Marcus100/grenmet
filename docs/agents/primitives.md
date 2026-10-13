# Primitives catalog

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

Reuse these before writing a new helper. If one is missing or hard to find,
add it here and file friction with the `file-friction` skill.

## Web (TypeScript)

| Need | Use | Path |
| --- | --- | --- |
| UI component | shadcn primitives (button, dialog, field, table, sidebar, sonner, …) | `packages/ui/src/components/ui/` → `@barrelsgd/ui/components/ui/<name>` |
| Conditional classes | `cn` | `packages/ui/src/lib/utils.ts` → `@barrelsgd/ui/lib/utils` |
| Initials, currency formatting | `getInitials`, `formatCurrency` | `packages/ui/src/lib/utils.ts` |
| Report a caught error | `reportError(error, "<area>")` | `apps/web/<app>/src/lib/report-error.ts` |
| Should an error reach Sentry? | `shouldReportError` | `packages/ui/src/lib/report-error.ts` |
| Sentry privacy scrubber | shared before-send rules | `packages/ui/src/lib/sentry-privacy.ts` |
| Analytics | consent policy + runtime | `packages/ui/src/lib/analytics-policy.ts`, `analytics-runtime.ts` |
| FastAPI types, fetchers, hooks, Zod | generated client | `@barrelsgd/api-client` (never edit `src/gen/`) |
| Session read/write, sign-in, redirects | `readSessionCookie`, `startAppSignIn`, `getSafeLocalReturnTo`, … | `packages/auth/src/server/index.ts` |
| Session user in client components | `SessionUserContext` | `packages/auth/src/client/` |
| GMS shared components and products | `@barrelsgd/gms` | `packages/gms/src/` |
| Typed env vars | `env` | `apps/web/<app>/src/env.ts` (where the app has one) |

## API (Python, `apps/api/fastapi/src`)

| Need | Use | Path |
| --- | --- | --- |
| Response/request schema base | `BaseModel` (`CustomModel`) | `models.py` |
| Shared response shapes | `Message`, `ApiError`, `ValidationErrorResponse` | `models.py` |
| Typed HTTP errors | `AppException`, `NotFoundError`, `AppValidationError`, `AuthenticationError`, `AuthorizationError` | `exceptions.py` |
| DB session, user, settings dependencies | `SessionDep`, `CurrentUser`, `AccountUser`, `AdminUser`, `SettingsDep` | `dependencies.py` |
| Permission check | `require_permission(current_user=…, permission_key=…)` | `auth/policy.py` (keys in `auth/permissions.py`) |
| Pagination | `PaginationParams`, `get_pagination_params`, `PaginatedResponse[T]` | `pagination.py` |
| Rate limiting | `limiter` | `rate_limit.py` |
| Audit trail | `set_actor`, `record_change`, `list_history` | `audit/service.py` |
| Email | `send_email` | `email.py`, `email_config.py`, `notifications/` |
| Background work | ARQ worker tasks | `worker/` (see `worker/AGENTS.md`) |
| Metrics | operational metrics | `operational_metrics.py`, `telemetry.py` |
