# FastAPI Scripts

Development and seeding scripts for the FastAPI backend. Run from inside the running API container:

```bash
docker compose exec api bash
```

## Scripts

| Script | Purpose |
|---|---|
| `seed_data.py` | Create custom users defined in `CUSTOM_USERS` |
| `clear_seed_data.py` | Remove test users matching `testuser*@weather.gd` |
| `quick_test.py` | HTTP-level smoke test — hits key endpoints and reports status |
| `format.sh` | Run ruff check --fix + ruff format |
| `lint.sh` | Run ruff check, ruff format --check, and mypy |
| `dev.sh` | Convenience wrapper for common docker compose commands |

## Seeding

See [SEED_DATA.md](SEED_DATA.md) for full usage of the seed scripts, including `--reset` and `--count` options.

Quick reference:

```bash
# From inside the container
python scripts/seed_data.py            # create custom users
python scripts/seed_data.py --reset    # clear test users first, then create
python scripts/clear_seed_data.py      # remove test users only
```

Or via docker compose from `apps/api/fastapi`:

```bash
docker compose exec api python scripts/seed_data.py --reset
```

## Smoke test

```bash
docker compose exec api python scripts/quick_test.py
```

Hits the health check, OpenAPI schema, and login endpoints. Exits non-zero on failure.
