# FastAPI Scripts

Development and seeding scripts for the FastAPI backend. Run from inside the running API container:

```bash
docker compose exec api bash
```

## Scripts

| Script | Purpose |
|---|---|
| `seed_data.py` | Create custom users defined in `CUSTOM_USERS` |
| `clear_seed_data.py` | Remove test users matching `testuser*@example.com` |
| `format.sh` | Run ruff check --fix + ruff format |
| `lint.sh` | Run ruff check, ruff format --check, and mypy |
| `dev.sh` | Convenience wrapper for common docker compose commands |
| `leave_reconciliation.py` | Read-only CSV comparing the leave ledger with legacy balance and carry-over tables; `--require-reconciled` exits 1 on findings. Output contains staff emails: HR only |

## Seeding

See [SEED_DATA.md](SEED_DATA.md) for full usage of the seed scripts, including `--reset` and `--count` options.

Quick reference:

```bash
# From inside the container
python scripts/seed_data.py            # create custom users
python scripts/seed_data.py --reset    # clear test users first, then create
python scripts/clear_seed_data.py      # remove test users only
```

Staging only: `seed_staging_demo.py` creates a synthetic studio (bookings in every state, a deposit service) and a verified and a pending events organiser with orders. It refuses unless `ENVIRONMENT=staging` and `DEMO_SEED_ENABLED=true` (see `docs/env.md`); it previews by default and `--apply` writes. Safe to repeat.

Or via docker compose from `apps/api/fastapi`:

```bash
docker compose exec api python scripts/seed_data.py --reset
```
