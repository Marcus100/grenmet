# Security Baseline

This guide records the current GrenMet security posture and the rules that keep docs and code aligned. It is not a full organizational security policy; it is the repo-level baseline for engineers.

## Implemented Controls

| Area | Current implementation |
| --- | --- |
| Secret storage | Local secrets live in `.env.local` files. Staging and production secrets are read from GitHub Environments and written to a temporary `.env` on the runner during deployment. |
| Secret validation | FastAPI rejects weak/default deployment secrets for non-local environments in `apps/api/fastapi/src/config.py`. |
| HTTPS | Traefik terminates TLS with Let's Encrypt on ports 80/443 and redirects HTTP to HTTPS. |
| Dashboard protection | Traefik and staging Adminer dashboards use basic auth from `USERNAME` and `HASHED_PASSWORD`. |
| CORS | FastAPI only enables CORS when `BACKEND_CORS_ORIGINS` or `FRONTEND_HOST` is configured. Allowed methods and headers are explicit. |
| Browser session | Web sessions use an opaque token in an `httpOnly`, `SameSite=Lax` cookie. `secure` is enabled when `NODE_ENV=production`. |
| API auth | FastAPI validates bearer JWTs for API requests. Browser apps exchange the opaque session token for short-lived access tokens server-side. |
| Authorization | FastAPI has superuser checks plus role, permission, and scoped role-assignment checks. CAP uses explicit permission keys such as `cap.alert.publish`. |
| Rate limiting | Login and password recovery/reset endpoints use SlowAPI limits: `10/minute` for login flows and `5/minute` for recovery/reset. |
| Webhooks | The Resend webhook verifies Svix signatures when `RESEND_WEBHOOK_SECRET` is set. If unset, it logs a warning and accepts events. |
| Vulnerability scanning | API CI runs Trivy filesystem and image scans and uploads SARIF. |
| Error tracking | FastAPI initializes Sentry outside local environments when `SENTRY_DSN` is set. Next.js apps include Sentry instrumentation files and build-time Sentry configuration. |
| Analytics | Several apps use PostHog through `@grenmet/ui/components/posthog-provider` when public PostHog env vars are configured. |

## Rules For Engineers

- Never commit populated `.env`, `.env.local`, or `.env.*.local` files.
- Do not place secrets in docs, screenshots, fixtures, seed data, or console output.
- Access env vars through the app's typed env module, except shared packages that cannot depend on app-local env files.
- Use `@grenmet/auth/server` helpers for browser session cookies.
- Use generated `@grenmet/api-client` code for FastAPI calls from web apps.
- Protect new FastAPI endpoints with `CurrentUser`, `CurrentSuperUser`, or explicit permission checks unless the endpoint is intentionally public.
- Keep public endpoints documented in `docs/api/contracts.md`.
- Add rate limiting to new password, login, token, webhook, or public write endpoints.
- If a webhook has a signing secret available, rejecting unsigned payloads must be the default.

## Authorization Model

FastAPI authorization currently has three layers:

1. Superuser-only dependencies for administrative operations.
2. Role and permission checks through `src.auth.policy`.
3. Scoped role assignments with `SELF`, `DEPARTMENT`, and `ALL` scopes.

CAP operations rely on permission keys:

| Permission | Typical use |
| --- | --- |
| `cap.alert.read` | Read CAP alert records and audit events |
| `cap.alert.create` | Create or duplicate alerts |
| `cap.alert.edit` | Edit draft, submitted, or approved alerts |
| `cap.alert.submit` | Move draft alerts to submitted |
| `cap.alert.approve` | Approve submitted alerts |
| `cap.alert.publish` | Publish, cancel, or expire alerts |
| `cap.settings.manage` | Manage CAP settings and predefined areas |
| `cap.integrations.manage` | Read integration and job-event state |

## Deployment And Infrastructure

Security-sensitive deployment facts:

- Production deployment runs on a self-hosted runner labeled `production`.
- Staging deployment runs on a self-hosted runner labeled `staging`.
- The deploy workflows generate a temporary `.env`, sanitize it in logs, and remove it in cleanup.
- Compose files use private Docker networks per environment.
- PostgreSQL is not exposed in staging/production compose files; local compose exposes port `5432` for development.
- Adminer is included in staging and local development. Production compose currently does not include Adminer.

## Security Gaps To Track

The following are not globally implemented yet:

- Content Security Policy and standard browser security headers for all Next.js apps.
- Centralized audit logging for all domains. CAP has audit events; general auth/HR actions do not yet have a uniform audit log.
- MFA or SSO for application users.
- Redis-backed distributed rate limiting.
- WAF or bot-protection layer.
- Request ID or correlation ID middleware.
- Formal backup restore drill evidence.
- Formal data retention and deletion policy in code.

Do not document these as complete controls until code or infrastructure exists.

