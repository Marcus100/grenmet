# Autonomous build plan

**Status:** Active plan  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-21

What agents build next without owner input, in waves, from the ADR decisions of
2026-10-20 (ADR-0003, 0018, 0020, 0027–0041) and the open items in
[product-and-hardening-handoff.md](product-and-hardening-handoff.md). Nothing on
the Barrels platform is live yet, so schema changes are cheap
([ADR-0034](../adr/0034-go-live-checklist.md)); that is why the schema lanes come first.

## Rules for every lane

- One lane is one worktree, one branch and one PR into `dev`. Once CI is green and
  a fresh-context review is clean, the agent merges its own PR into `dev`; the
  owner merges anything that touches the agent limits, CI or rulesets, and every
  merge into `staging` and `main`. Agents never push `dev`, `staging` or `main`
  ([ADR-0042](../adr/0042-agents-merge-into-dev.md), amending
  [ADR-0041](../adr/0041-agent-autonomy.md)).
- Read the nested `AGENTS.md` for every path touched, and the lane's ADR, before
  editing. API contract changes use the `api-change` skill; `apps/web/gaa-admin`
  uses `gaa-admin-change`.
- Tests ship with the change. Run `pnpm verify:changed` before pushing; discard
  `pnpm-lock.yaml` churn from installs (the local pnpm adds an `@pnpm/exe` entry).
- Failure budget: the same check failing twice on the same error stops the lane;
  record the raw output in the PR or run record and move on.
- Host limits: at most **4 agents at once**, and at most **2** running the full
  API suite at the same time (it takes ~20 minutes and Postgres is shared).
- Ask-first items stop the lane and go to the owner list below: new dependencies,
  `turbo.json`, `biome.jsonc`, `tsconfig*.json`, destructive changes to shared
  staging data, anything needing a dashboard or secret.
- Each lane ends with a run record (`run-record.mjs --from-session latest`) and,
  if anything was worked around, `file-friction`.

## Wave 1: schema and policy foundations (now; nothing is live)

Alembic note: lanes 1.1 and 1.2 both add migrations to the main chain, so they
run **in sequence in one agent**, not in parallel.

| Lane | ADR | Work | Agent | Done when |
| --- | --- | --- | --- | --- |
| 1.1 Events into the main database | 0003 | Recreate the Events tables as the `events` schema in APP (main Alembic chain); point Events at the main session; delete Events' outbox, `drain_events_outbox`, `sync_event_rewards` and the EVENTS database config (`src/events/alembic.ini`, `infra/postgres/init-databases.sh`, deploy compose, `render-env.py`, `docs/env.md`); points save with the ticket in one transaction | api-engineer | Events, payments, rewards and outbox tests pass on one database; no `EVENTS_DB_*` left outside history docs |
| 1.2 Contacts party/role | 0028 | Remove name/email/phone from `bookings.customer`, make `contact_id` required, read personal fields through `contacts`; same for `billing.customer` (handoff §6.2) | api-engineer (after 1.1) | Bookings and billing tests pass; client regenerated; no personal columns outside `contacts` |
| 1.3 One permission list for API keys | 0029 | API-key scopes reference keys in `src/auth/permissions.py`; test fails on an unknown scope | api-engineer | New test plus existing key tests pass |
| 1.4 Email verification for money and power | 0018 | Require a verified email before deposit payment, staff/admin role grant and payout-detail change; never for sign-in | api-engineer | Tests for each gate and for sign-in staying open |
| 1.5 Monitoring may carry internal IDs | 0037 | Allow internal user and organisation IDs in `packages/ui/src/lib/sentry-privacy.ts` and `SAFE_TAGS` in `src/telemetry.py`; still no names, emails or bodies | web-engineer + api-engineer | Scrubber tests prove IDs pass and personal fields do not |
| 1.6 Babydoll booking switch as a flag | 0020 | Read Babydoll's online-booking switch from a PF7 feature flag, keep `BABYDOLL_ONLINE_BOOKING` as an emergency override, default off | web-engineer | Book-link tests pass in both flag states; live site unchanged with the flag off |

## Wave 2: Barrels Bookings app (after wave 1 merges)

| Lane | Work | Agent | Done when |
| --- | --- | --- | --- |
| 2.1 Register the bookings app for sign-in (#456) | `auth/apps.py` entry, `BOOKINGS_APP_URL` and `BOOKINGS_SSO_CLIENT_SECRET` config and docs | api-engineer | Auth tests pass; secret stays unset until the owner sets it |
| 2.2 Public flow `/{slug}` | Storefront → availability → details → confirm → manage link, using `@barrelsgd/bookings-web` | web-engineer | Component and e2e-skip-safe tests; `ui:screenshots` clean at 375/1280 |
| 2.3 `/studio` | Organisation selector, day/week agenda, booking detail (confirm, decline, cancel, no-show, complete), New booking form (staff create endpoint) | web-engineer | Tests per action; screenshots reviewed with `ui-check` |
| 2.4 `/studio/settings` | Services, providers, weekly hours, time off, reorder | web-engineer | Tests; uses existing org routes |

## Wave 3: repo-only hardening (parallel with wave 2)

From handoff §2, §4 and §6; one PR each.

1. Narrow uvicorn `--forwarded-allow-ips` to an explicit compose subnet, with a
   compose-parsing test (§2.2).
2. `EMAIL_TEST_USER` default to `test@example.com` (§2.3); stale docs (§2.4,
   except `turbo.json`, which is ask-first).
3. Split `findViolations` in `check-boundaries.mjs` (§2.5).
4. CSP Report-Only for static apps `mbia`, `elections`, and `babydoll/vercel.json`
   (§4.1, §4.4). Enforcement waits for 7 clean days (owner).
5. Remove the legacy email drain once unused (§6.1); decouple `rewards` from
   Events models (§6.4, mostly done by lane 1.1); break the
   `baseline ↔ hr ↔ auth` import cycle (design note first, §6.5).
6. Investigate the Dependabot `uv` resolution failure and split the group (§1.3).
7. Phone-punch approval (ADR-0040): phone clock-in exists
   (`src/hr/attendance/clock_router.py`); make each phone punch pending until a
   supervisor approves it, with an approval queue in `gaa-admin`. API contract
   change (`api-change` skill). The ZKTeco terminal import waits on the owner.
8. Fix the ADR follow-ups found in review: `src/cap/AGENTS.md` related list (done),
   `SESSION_COOKIE_DOMAIN` leftovers outside `turbo.json`.

## Wave 4: weather data (after wave 1)

| Lane | ADR | Work | Done when |
| --- | --- | --- | --- |
| 4.1 Observation store and publish gate | 0032 | Observation tables in their own schema in the EREGISTER database; per-station-hour publish gate; eRegister publishes only through the gate | Gate tests prove a station-hour is published once; WIS2 double-publish closed |
| 4.2 Self-registering domains | 0031 | Steps 1–3 of the ADR (manifest, golden snapshots, pilot `webhooks_out` and `contacts`), after 4.1 | `openapi.json` byte-identical; snapshots pass |

## Wave 5: factory (needs the WIS2 CLI login once)

1. First `/factory-improve` run: `agents:score`, `agents:improve`, one proposed
   change as a `factory/*` PR.
2. `pnpm agents:skill-evals --agent claude --model claude-haiku-5-5` baseline;
   fix any skill that misfires.
3. Add 3+ area-specific benchmark tasks each for `web` and `api` so
   `agents:routing` can measure the owner's Haiku/Luna preference.

## Owner-blocked (prepare docs and config only; never flip)

| Item | Needs |
| --- | --- |
| Accept ADR-0017 (SSO) | 10-minute staging sign-out check |
| Live payments (ADR-0027) | Stripe's written answer on NZ-account payouts to Grenadian banks; accountant/legal on tax and licensing |
| Attendance import (ADR-0040) | ZKTeco model and export method (file, SDK or pull) |
| Go-live checklist (ADR-0034) | Restore drill first run (Spaces read key), production monitors (Better Stack token) |
| Traefik hardening #445 | Three staging secrets |
| Bookings sign-in | Set `BOOKINGS_SSO_CLIENT_SECRET` after lane 2.1 merges |
| Babydoll services | Real services and durations from the salon |
| Data ownership (ADR-0033) | GAA contract wording |
| Self-hosted monitoring (ADR-0037) | Decide after the GlitchTip/Uptime Kuma comparison |
| `SESSION_COOKIE_DOMAIN` in `turbo.json` | Ask-first file |

## How the owner follows progress

- Each lane opens a PR into `dev` with the `/commit` recap and a risk label.
- `pnpm agents:flow` shows changes, tokens and human prompts per change;
  `SESSION_LOG.md` gets one entry per wave.
- A lane that stops early says why in its PR or in a `needs-info` issue.
