# Verification before promotion

Run `pnpm verify:changed` to run only the gates the diff against `origin/dev`
needs: Biome on changed files, affected Turbo type-check and tests, FastAPI lint
and the changed domains' pytest suites, drift, blast radius, guardrails and docs.
`--dry-run` prints the plan; `--full` runs the whole API suite including the
fuzz tests that are skipped locally by default; `--skip <check>` drops one (for example `api tests`
when no database is reachable); `--base <ref>` changes the comparison. API tests
run through `scripts/agents/api-env.sh`, which supplies the local-development
database settings (values already in the environment win).

## Which API gates a change selects

Lint+types (`ruff check`/`ruff format --check` over `src scripts tests`, then
`mypy src`) runs for any change under `apps/api/fastapi/**/*.py`, under
`apps/api/fastapi/tests/`, or to a dependency manifest. Pytest targets:

| Changed path (under `apps/api/fastapi/`) | Pytest targets |
| --- | --- |
| `src/<domain>/...` | `tests/<domain>/` and `tests/test_<domain>_*.py` |
| `src/main.py` | Core subset: `test_startup_imports.py`, `test_openapi_contract.py`, `test_release_contract_inputs.py`, `test_settings.py`, `test_schema_datetime_guard.py`, `tests/utils/` |
| other `src/*.py` (shared modules) | Full suite |
| `tests/<dir>/...` | `tests/<dir>/` |
| `tests/test_*.py` | That file |
| `tests/conftest.py`, `factories.py`, `database_target.py` | Full suite |
| `pyproject.toml`, `uv.lock` (repo root or API) | Full suite |

`main.py` is also a contract file, so API-client drift runs. The subset is a
local fast path: CI (`ci-api.yml`) still runs the full suite on every push, and
the schemathesis fuzz test (`test_api_fuzz.py`) runs there in its own job. Run
`pnpm verify:changed --dry-run` to see the exact plan.

API pytest runs in parallel. Workers default to CPUs minus two (minimum 1) and
drop to two when the 1-minute load average exceeds the CPU count; set
`PYTEST_WORKERS=<n>` to override. The Schemathesis fuzz test is marked `fuzz` and
deselected by default (`pyproject.toml` addopts); `--full` or `pytest -m fuzz` runs
it, and editing `tests/test_api_fuzz.py` opts it back in automatically. CI runs it
in its own parallel job.

Run `pnpm verify:quick` for lint, types and unit tests. The pre-push hook runs lint
and type-check everywhere, and tests only for the packages changed in the pushed
commits (`pre-push-scope.mjs`). It does not claim backend or deployment acceptance.

From the **host workstation**, with Docker Compose, Node/pnpm, uv and PostgreSQL
client (`psql`) installed:

- `pnpm verify:backend`: temporary PostgreSQL/Redis and parallel Python coverage.
- `pnpm verify:storage`: temporary PostGIS plus real migration/seed/role tests.
- `pnpm verify:collectors`: isolated wxwatch, Sutron and GMS ingestion fixture suites;
  also runs in the devcontainer without Docker. Requires uv and Python 3.14.
- `pnpm verify:release`: quick checks, API-client drift, documentation links,
  guardrails, delivery tests, collectors, backend and storage integration.

The managed backend/storage/release commands refuse to run inside a devcontainer. They create a unique
Compose project, random loopback-only ports and memory-backed database storage.
Their cleanup removes only that project. No existing Compose projects or volumes
are pruned. If interrupted forcibly (SIGKILL or host failure), inspect and remove
only the printed `grenmet-verify-*` project. Missing tools fail verification.

Backend and storage images match their respective CI service images. Redis is
available for backend tests. Nothing connects to staging or production; scheduled
backups remain production-only. These commands do not deploy or publish images.

## CI and manually managed test services

CI invokes the same scripts, passing explicit disposable service configuration:

- `bash scripts/verification/backend.sh` (PostgreSQL host/user/password required).
- `bash scripts/verification/storage.sh` (`STORAGE_TEST_POSTGRES_URL` required).
- `bash scripts/verification/collectors.sh` (frozen, isolated uv environments;
  sequential suites, no live weather feeds or serial hardware).

Storage verification also runs the CMS editorial workflow suite against its
explicit disposable service, using a UUID schema. It invokes Vitest directly so
Turbo cannot reuse a previous unit-only result. An inherited CMS test database URL
is replaced with the disposable service URL. Editorial failures fail the command.
Normal `pnpm test` remains a unit/component entrypoint and may skip that suite.

The API CI aggregate requires the collector job, including when image selection
omits Docker checks. Local release verification runs the same collector script.

When intentionally using a dedicated test service from the devcontainer, these
scripts can connect to the host-published port. Never supply application-service
credentials. Backend database creation/teardown requires an administrative role
on the disposable instance; ordinary application roles should remain restricted.
Backend uses one worker per CPU in CI (4 on GitHub's standard runners) and two fewer than the CPUs elsewhere (at least one); set `TEST_WORKERS` to override.
CI passes `-m 'not fuzz' --shard i/3` (three jobs) or `-m fuzz` (one job) after the
script name and sets `COVERAGE_DATA_ONLY=1` so each job writes only a coverage data
file for the combining job to merge (see `docs/testing.md`, CI test sharding).
Coverage and JUnit reports are written under `apps/api/fastapi/`.
Backend verification creates and cleans up its own temporary uv environment,
preserving the development `.venv` even when host and devcontainer interpreter
paths differ. It installs the API and GMS collector together for NHC acceptance,
using the frozen lockfile and uv's download cache.

The shared database helper assigns a run identifier before importing application
settings and extends it with the worker identifier. Operations must match that
exact ownership tuple. Normal teardown drops only that database. Abrupt process
failure is additionally contained by the disposable instance lifecycle.

## Acceptance

Local verification, GitHub checks, container builds/scans and staging acceptance
are separate results. A required integration command must fail when its service
or tooling is missing, never report a skipped suite as acceptance. Unit-only CMS
runs may still skip explicitly optional integration tests.

Staging's existing pipeline gates deployment on all required CI and image jobs,
and passes the exact commit to deployment. Keep the existing workflow gate tests.
External branch rules and production promotion remain operator-controlled.

Before promoting these improvements, run the managed backend and storage commands
on the host, verify concurrent runs stay isolated, and review required GitHub PR
checks. No managed Docker execution has been verified from a container without
socket access.

References: [pytest-xdist isolation](https://pytest-xdist.readthedocs.io/en/stable/how-to.html),
[pytest-cov contexts](https://pytest-cov.readthedocs.io/en/latest/contexts.html),
[Turbo caching configuration](https://turborepo.dev/docs/reference/configuration),
[GitHub PostgreSQL services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

See the [repository testing strategy](../../docs/testing.md) for coverage owners,
stage-specific checks and remaining acceptance gaps.
