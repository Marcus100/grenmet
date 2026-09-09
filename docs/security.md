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

### Node runtime remediation candidate

The nine Node Dockerfiles now separate `build-base` from `runtime-base`.
Builders retain Corepack/pnpm for frozen installs and compilation. Final web,
Hono and migration stages remove bundled npm, Corepack and Yarn, including
executables and their global installation directories. Application dependencies
remain intact; the audited runtime and migration entrypoints invoke Node directly.

The shared image smoke script first checks the exact final Node filesystem for
package-manager commands and installation directories, with networking disabled.
A failed tooling check blocks application startup tests and migration checks;
existing functional smoke and vulnerability scans remain required. This removes
the bundled-npm finding source rather than suppressing its scan results.

This candidate is not proof of a clean vulnerability baseline. Exact image
builds/scans and staging acceptance are pending. The framework upgrade and CMS compiler remediation are tracked below;
full API database regressions and remaining image scans are required. No vulnerability exceptions were added.

### CMS migration compiler remediation candidate

The operator's first rebuilt CMS migration image passed offline smoke but failed
vulnerability policy (133 reported findings; no exceptions). Blocking entries
identify esbuild 0.18.20, esbuild 0.25.12 and native TypeScript 7.0.2 binaries.
Scoped overrides replace esbuild under Drizzle Kit 0.31.7 and
@esbuild-kit/core-utils 3.3.2 with 0.28.2. A named migration catalog supplies
TypeScript 6.0.3, preserving the JavaScript compiler API used by Payload tooling;
the application build/type-check catalog stays on TypeScript 7.

The isolated production dependency package contains only esbuild 0.28.2 and
TypeScript 6.0.3. Payload's CLI successfully loads the real configuration and
migration modules, transpiles TypeScript and generates an empty migration diff
for an unchanged schema. This is compatibility evidence, not a clean-image scan
or a database migration. Rebuild, rescan and run CI/staging database gates before
acceptance. No exceptions or scanner exclusions were added.

### Cryptography remediation candidate

A targeted uv resolution updated only cryptography 49.0.0 to 50.0.1 and
PyOpenSSL 26.3.0 to 26.4.0 in the shared lockfile. PyOpenSSL is used by the
weather scraper; CAP XML signing uses cryptography through SignXML.
Cryptography 50 includes the upstream fix for CVE-2026-69247, and 50.0.1
refreshes bundled OpenSSL in its wheels. See the
[upstream changelog](https://cryptography.io/en/latest/changelog/).

The two existing CAP signing tests passed against the updated environment,
including a real certificate/signature round trip. They ran with `--noconftest`
to avoid unrelated database bootstrap; this does not replace the full API/DB
suite in CI. All 38 scraper tests also passed with the updated dependencies.
Exact production image scans remain necessary to verify the finding is cleared.

Policy regression tests cover severity/fix handling, exact exception scope,
expiry, malformed reports, missing output and scan-before-push ordering. Local
Docker execution remains unavailable; actual scanner/image behavior must be
verified in CI. Database and migration checks remain required after dependency
remediation.

References: [Trivy vulnerability detection](https://www.trivy.dev/docs/dev/guide/scanner/vulnerability/),
[Trivy filtering](https://trivy.dev/docs/dev/docs/configuration/filtering/), and
[Docker test-before-push](https://docs.docker.com/build/ci/github-actions/test-before-push/).

### September 8 verification update

The rebuilt CMS migration image (config
`sha256:46e9d150e03cb903a795b126d510919040ac6ce3e410597cb2e4be0af296bc11`)
passed the extended offline smoke and operator Trivy 0.70.0 scan at 02:35 UTC:
one reported finding, zero blocked findings, zero exceptions. The remaining
MEDIUM CVE-2026-11779 affects Payload 3.88.0, with no patched version listed.
The active Users collection disables local authentication and the installed
Payload unlock operation throws Forbidden in that configuration. This is code
inspection evidence for current configuration, not a scanner suppression or
proof for future configurations. See the [advisory](https://github.com/advisories/GHSA-jg8r-5jh2-v2xj).

The FastAPI candidate now resolves 0.141.1 with Starlette 1.6.0. Baseline and
candidate import all 129 paths. OpenAPI differs only by optional `input` and
`ctx` validation-error properties; the generated TypeScript/Zod client is
regenerated accordingly. Real image scan and staging acceptance remain required.
Live Google OAuth configuration and provider callback verification are pending;
local auth tests use synthetic settings and do not contact Google.

The [workspace dependency audit](operations/dependency-audit-2026-09-08.md)
records available upgrades, intentional holds and package-manager version drift.

Framework candidate local verification: Ruff passes; mypy passes all 142 source
files; 16 workspace TypeScript tasks, 10 generated-client tests and 43 guardrail
tests pass. The existing health/email suite (3 tests) and modern-auth suite
(8 tests) pass against the dedicated test database. Two full candidate runs
stopped on PostgreSQL connection timeouts after 40 and 22 passing tests.
The old framework passed isolated 2FA tests, but its full comparison reached
105 tests before the 240-second diagnostic timeout. This does not establish the
cause of the container-side failures. The operator subsequently ran the full
frozen candidate suite on MARCUS100 against localhost: **306 passed**, 68 warnings,
297.14 seconds. This clears the host database regression gate; CI, exact image
scan and staging acceptance remain required. Warnings include local placeholder
credentials and Starlette's deprecated httpx TestClient integration. The host
recreated its virtual environment because the previous interpreter link was
invalid; do not infer that this proves the cause of earlier database timeouts.

### API Debian runtime follow-up

The operator's API image scan reported 325 findings with no policy blockers or
exceptions. Six fixable UNKNOWN entries identify two installed packages:
ca-certificates 20230311+deb12u1 and libpcre2-8-0 10.42-1. Debian provides
Bookworm security updates 20250419~deb12u1 and 10.42-1+deb12u1 respectively.
The production Dockerfile now explicitly updates both alongside curl and
checks those minimum versions. This invalidates the runtime apt layer while
retaining the builder dependency cache. Rebuild, smoke and rescan are pending;
UNKNOWN severity is not being reclassified or suppressed.

Sources: [CA certificates advisory](https://security-tracker.debian.org/tracker/DLA-4726-1),
[PCRE2 advisory](https://security-tracker.debian.org/tracker/CVE-2026-86145).

The HIGH list repeats source-package CVEs across related binary packages,
especially util-linux and curl; counts are finding instances, not unique CVEs.
No blanket non-applicability decision has been made for those findings.
Operator checks of the earlier image found Perl pointer size 8 and Archive::Tar
unavailable on its configured module paths. These support excluding the 32-bit
Perl condition and missing archive module from current applicability, without
scanner exclusions. SQLite and the other Perl findings remain under review.
