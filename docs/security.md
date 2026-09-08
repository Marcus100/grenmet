# Security Baseline

This guide records the current Barrels Grenada security posture and the rules that keep docs and code aligned. It is not a full organizational security policy; it is the repo-level baseline for engineers.

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
| Vulnerability scanning | Image verification blocks fixable high/critical findings before publishing; JSON/SARIF evidence is retained. The initial enforcement candidate still requires remediation and staging acceptance. |
| Error tracking | FastAPI initializes Sentry outside local environments when `SENTRY_DSN` is set. Next.js apps include Sentry instrumentation files and build-time Sentry configuration. |
| Analytics | Several apps use PostHog through `@barrelsgd/ui/components/posthog-provider` when public PostHog env vars are configured. |

## Rules For Engineers

- Never commit populated `.env`, `.env.local`, or `.env.*.local` files.
- Do not place secrets in docs, screenshots, fixtures, seed data, or console output.
- Access env vars through the app's typed env module, except shared packages that cannot depend on app-local env files.
- Use `@barrelsgd/auth/server` helpers for browser session cookies.
- Use generated `@barrelsgd/api-client` code for FastAPI calls from web apps.
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



## Image vulnerability policy

The shared `.github/actions/scan-image` action scans the locally built image
before publishing. PR image checks use the same gate. Core web/API, migration,
and enabled weather images are covered; required branch-check names remain
unchanged. Production build workflows run the scan again with database updates
enabled. This is not yet manifest-based promotion or a provenance verifier.

Trivy v0.70.0 is installed through a SHA-pinned action. All vulnerability
severities are retained in JSON and SARIF artifacts; the gate blocks HIGH or
CRITICAL findings with a nonempty `FixedVersion`. Unfixed and lower-severity
findings remain visible and are not treated as exceptions. Scanner failures,
missing/unsupported reports and invalid policy documents fail closed. Artifact
retention follows repository defaults and is not a durable release archive.

The scanner exits zero for findings so evidence can be retained before the
separate policy step rejects the image. This does not suppress scanner errors.
SARIF upload to the Security tab is reporting; it cannot override the policy
step. The filesystem scan remains supplemental reporting.

### Exceptions

`.github/security/vulnerability-exceptions.json` starts empty. An exception
requires all of these fields:

- `scope`: exact Dockerfile path plus target, e.g. `apps/web/cms/Dockerfile#migrate`.
- `vulnerability`, `package`, `installedVersion`: exact finding identity; no wildcards.
- `reason`: documented justification and remediation tracking reference.
- `owner`: accountable person or team, chosen during review.
- `reviewedAt`, `expiresAt`: UTC timestamps such as `2026-09-08T00:00:00Z`.

Expiry must be after the current time and at most fourteen days after review.
Future review dates, expired entries and duplicates fail the policy even if the
current image does not use the entry. Remove expired entries or have a new
review; never automatically extend them. Normal protected-branch review applies
to policy changes. The validator checks metadata and scope, not the truth of a
risk-acceptance decision. No baseline finding has been silently excepted.

### Initial baseline review — September 8, 2026

GitHub's open staging alerts were filtered to commit
`979522b4e18eb8dba5b355a03d830b4d7098c677`, excluding stale commit results.
There were 142 high/critical alert instances, of which 71 reported a fix. These
are alert instances, not unique CVEs or an exhaustive fresh scan of every image.
Weather was disabled in that staging run and needs its own image evidence.

| Source of fixable findings | Reviewed installed baseline | Next remediation |
| --- | --- | --- |
| API Python libraries | Starlette 0.46.2; cryptography 49.0.0 | Review compatible FastAPI/Starlette upgrade and cryptography 50.0.0; run auth/API and database regressions |
| Node base image's bundled npm | tar 7.5.15, undici 6.26.0, pacote 21.5.0, ip-address 10.2.0, brace-expansion 5.0.6 | Refresh pinned base or remove unnecessary runtime package-manager tooling, then scan the exact image |
| CMS migration tool binaries | esbuild with Go 1.20.7 and 1.23.12; TypeScript with Go 1.26.4 and x/text 0.38.0 | Review upstream compatible tool upgrades or removal of unnecessary runtime tools; retain actual Payload CLI/migration checks |

The initial gate candidate will reject this baseline. **Do not promote it as a
green release until remediation or explicitly reviewed exceptions produce a
passing image scan and staging run.** Go stdlib fixed versions describe the
compiler used to rebuild affected binaries; installing another Go runtime does
not fix those embedded binaries. Do not blanket-ignore findings based only on
an assumed lack of reachability.

Policy regression tests cover severity/fix handling, exact exception scope,
expiry, malformed reports, missing output and scan-before-push ordering. Local
Docker execution remains unavailable; actual scanner/image behavior must be
verified in CI. Database and migration checks remain required after dependency
remediation.

References: [Trivy vulnerability detection](https://www.trivy.dev/docs/dev/guide/scanner/vulnerability/),
[Trivy filtering](https://trivy.dev/docs/dev/docs/configuration/filtering/), and
[Docker test-before-push](https://docs.docker.com/build/ci/github-actions/test-before-push/).
