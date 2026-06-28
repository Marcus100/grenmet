# FastAPI → Staging/Production prep

Status of the integrated GMS FastAPI backend hardening (auth / hr / cap) and the
remaining manual steps. Companion to `docs/fastapi-cap-audit.md`.

## Done (implemented + tested)

| Area | What | Notes |
|---|---|---|
| Permissions | Declarative catalog (`src/auth/permissions.py`) + default roles + idempotent seeder + governance guard test | Seeded in `scripts/initial_data.py` (prestart), not in test fixtures |
| Storage | `src/storage/` DO Spaces (S3-compatible) service: presigned upload/download, public URL, put/delete | Set `STORAGE_*` env to enable; `boto3` added |
| Worker | `src/worker/` arq + Redis; consumes `cap.job_event` outbox; **webhooks publisher** (HMAC) + **PDF publisher** (fpdf2 → Spaces) | `redis`+`worker` compose services; MQTT/WIS2 = skipped (separate wis2box) |
| Rate limiting | slowapi now uses Redis store when `REDIS_URL` set (multi-instance safe) | in-memory fallback when unset |
| CAP drift | Reconciled FK `ondelete=CASCADE` + TEXT types on the **model** side; consolidated `alert.identifier` to a unique index | `alembic check` → "No new upgrade operations detected" |
| Auth | Redis-backed **account lockout** (fail-open) on both login endpoints | `LOGIN_*` settings; disabled when `REDIS_URL` unset |

## Required env vars for staging/prod (set in deploy env, not committed)

```
ENVIRONMENT=staging|production
SECRET_KEY=<32+ chars, explicit>            # refusal-to-default enforced outside local
POSTGRES_PASSWORD / FIRST_SUPERUSER_PASSWORD  # strength-validated outside local
REDIS_URL=redis://<host>:6379/0             # enables worker, shared rate-limit, lockout
STORAGE_ENDPOINT_URL / STORAGE_BUCKET / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY
STORAGE_PUBLIC_BASE_URL=<cdn base>          # optional
SESSION_COOKIE_DOMAIN=.barrels.gd           # for subdomain SSO (when ready)
```

## Deferred — needs your review (intentionally not done solo)

1. **2FA (TOTP) for privileged roles** — needs a `User.totp_secret` column (migration), an
   enrollment + verify flow, and frontend coordination. Recommended before public launch.
2. **Reduce the 8-day legacy JWT default** (`ACCESS_TOKEN_EXPIRE_MINUTES`) — changing the
   default is a breaking change for existing clients; prefer short access tokens + the
   30-day rotating session. Decide rollout, then change the default.
3. **Static-map / social-image publishers** — need an external tile service + ToS decision;
   currently registered as skipped handlers.
4. **Postgres collation mismatch** on the `app` DB — run `ALTER DATABASE app REFRESH
   COLLATION VERSION;` (cosmetic warning today).

## Step 7 — fresh baseline squash (DESTRUCTIVE — run manually when ready)

You confirmed there is no data to migrate and a clean start is acceptable. Since the CAP
drift is now resolved on the model side, the migration history can be squashed into one
clean baseline. **Do this only when you're ready to wipe the dev/staging DB.**

```bash
cd apps/api/fastapi

# 1. Back up first if there's anything you care about.
# 2. Drop & recreate the schema (DESTRUCTIVE):
docker exec grenmet-postgres psql -U postgres -d app -c \
  "DROP SCHEMA IF EXISTS hr CASCADE; DROP SCHEMA IF EXISTS cap CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Remove old versions and autogenerate a single baseline:
rm alembic/versions/*.py
docker compose exec api uv run alembic revision --autogenerate -m "baseline schema"
#    Review the generated file (enum creation, schemas hr/cap, indexes).
docker compose exec api uv run alembic upgrade head

# 4. Reseed:
docker compose exec api uv run python scripts/initial_data.py   # superuser + permissions + roles
docker compose exec api uv run alembic check                    # must report no drift
```

After the squash, regenerate the API contract and client (Ask-First gate):

```bash
docker compose exec api uv run python -c \
  "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
pnpm generate:api-client
```

## Operational lesson (worth keeping)

Run the test suite as **one process at a time** — the async fixtures truncate every table
per test, so concurrent `pytest` runs deadlock on table locks and leave
`idle-in-transaction` backends. Clear with:
`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='app' AND pid<>pg_backend_pid();`
