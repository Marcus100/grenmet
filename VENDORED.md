# Vendored applications

Third-party applications vendored into this monorepo as maintained copies
(fork-and-maintain). They keep their upstream licences. Upstream git history is not retained, so provenance is recorded
here — future upgrades or upstream-fix ports are done by diffing against the
recorded upstream release.

| Folder     | Upstream                                    | Version | Vendored   |
| ---------- | ------------------------------------------- | ------- | ---------- |
| `surface/` | SURFACE CDMS (installed via `surface-cdms`) | 1.0.0   | 2026-07-08 |
| `wis2box/` | WMO wis2box setup bundle                    | 1.3     | 2026-07-08 |
| `geonetcast/` | GNC-A Python training scripts (INPE/NOAA GNC-A courses) | May 2023 course | 2026-07-08 |

## surface/

Full Django/PostGIS source of the SURFACE climate data management system, now
maintained as the GMS flavor. It was unpacked by the `surface-cdms` installer
(never a git clone), so there is no upstream commit hash; `SURFACE_CDMS_VERSION`
in `api/production.env` records the release.

- Runs via its own `docker-compose.yml` on the **host**, not in the devcontainer.
- Gitignored: `data/` and `backup_restore_dumps/` (runtime bind mounts;
  `data/postgresql/` is the live database), `.env`, `api/production.env`
  (secrets). Committed templates: `.env.example`, `api/production.env.example`.

### Local security pins

Our own changes to upstream's `api/requirements.in` and `api/requirements.txt`.
Each pin came from a GitHub security alert. Keep them, or newer versions, when
reconciling an upstream release.

| Package | Upstream | Ours | Source | Note |
| --- | --- | --- | --- | --- |
| `PyJWT` | 2.4.0 | 2.15.0 | Dependabot #388 | Pinned in `requirements.in` too. Checked against `djangorestframework-simplejwt` 5.0.0 on Python 3.11: tokens round-trip and tampered tokens are rejected |
| `werkzeug` | 3.1.4 | 3.1.9 | Dependabot #389 | Transitive via `flask` |
| `fsspec` | 2025.12.0 | 2026.6.0 | Dependabot #391 | Transitive via `pyiceberg` |
| `multidict` | 6.7.0 | 6.9.1 | Dependabot #393 | Transitive via `yarl` |

The transitive pins were first edited in place in the pip-compiled
`requirements.txt`. The lock was then re-resolved with `pip-compile` for #722
step 1, and those versions held (they are all still at or above the values
above). If you re-run `pip-compile`, keep these versions as lower bounds.

### Upgrade pins (#722)

Step 1 moved SURFACE from Django 3.2.13 to Django 4.2. Step 2 moved it to
Django 5.2 LTS (`>=5.2.8,<5.3`, resolved 5.2.18; supported to April 2028) and
the database to PostgreSQL 17, because Django 5.2 needs PostgreSQL 14 or newer.

| Package | Upstream | Ours | Note |
| --- | --- | --- | --- |
| `Django` | 3.2.13 | 5.2.18 | LTS |
| Database image | `timescaledb-postgis:2.3.0-pg13` | `timescaledb-ha:pg17.11-ts2.31.0` (digest-pinned) | PostgreSQL 17.11, TimescaleDB 2.31.0, PostGIS 3.6.4. The old image line stopped at pg13. Runs as uid 1000 with data under `/home/postgres/pgdata/data`; `PGDATA` in the SURFACE env file must sit inside that mount |
| `djangorestframework`, `djangorestframework-simplejwt`, `django-celery-beat`, `django-cors-headers`, `django-import-export` (4.x), `django-simple-history`, `celery`, `kombu`, `amqp`, `redis`, `requests`, `gunicorn`, `psycopg2-binary` | older | see `requirements.in` | Raised to versions that support Django 5.2 or carry security fixes |
| `Pillow`, `anyio`, `lxml`, `soupsieve`, `sqlparse`, `urllib3`, `cryptography`, `geopandas` | older | see `requirements.in` | Security floors from Dependabot advisories |
| `pymemcache` | `python-memcached` | 4.0.0 | Replaces `python-memcached`; Django 4.1 removed `MemcachedCache` (settings use `PyMemcacheCache`) |
| `django-colorfield` | 0.4.5 | 0.14.x | `ColorField` max_length 18 to 25; migration `wx/0078` widens the two columns |
| `django-material` | 1.10.0 | 1.12.0 | Unmaintained (merged into django-viewflow); works on 5.2 in the smoke run below, replace when SURFACE's UI is reworked |
| `django-timescaledb` | 0.2.12 | 0.2.13 | Last release 2023; works on 5.2 and TimescaleDB 2.31 in the smoke run below |
| `django-ckeditor` | 6.7.1 | removed | Bundled CKEditor 4 was end of life (#803). The six rich-text fields are plain `TextField`s with plain text boxes; migration `wx/0079` converts stored HTML to plain text once. It is not reversible: take a database dump (`pg_dump`, or a copy of the `data/postgresql` volume) before running `migrate`, and old migrations reference `models.TextField` |

Django 5 code changes: sign-out in `templates/base.html` is a POST form
(`LogoutView` no longer accepts GET), and the unused `USE_L10N` setting is gone.

Step 2 verification (host, Docker): built `Dockerfile.deploy`; `manage.py check`
clean (the CKEditor warning was removed with the editor in #803); `makemigrations --check` clean; all `wx`
migrations applied to an empty PostgreSQL 17 database and the `raw_data`
hypertable was created; `wx.tests` pass (7); a CSRF-enforced client signed in,
loaded the station map, admin, station admin, variable export and API root, got
405 from GET logout and signed out with POST. The `backup_postgres` task's
`pg_basebackup` call (same arguments, as `dba` on the `172.25.0.0/16` network
that `pg_hba.custom.conf` allows) produced a PostgreSQL 17 base backup;
`Dockerfile.deploy` installs the PostgreSQL 17 client for this because the base
image's Debian client is 15. `surface/docker-compose.yml` now builds its app
services from `Dockerfile.deploy` too, so the dev stack runs the locked pins
instead of the old base image. An existing pg13 data directory
does not start on the new image: dump and restore it (no live SURFACE host
existed when this changed).

`Dockerfile.deploy` now installs `api/requirements.txt` on top of the upstream
`surface-base` image; before that the pins never reached a running container.

CKEditor removal (#803) verification (host, Docker): built `Dockerfile.deploy`
(which now also uninstalls `django-ckeditor` and `django-js-asset`, because the
upstream base image still ships them); `manage.py check` has no warnings and
`makemigrations --check` finds no changes; `migrate` applied `wx/0079` on a
PostgreSQL 17 database; the six columns are still `text`; `wx.tests` pass (18);
a CSRF-enforced client signed in and loaded the station map, admin, the
maintenance report list, the new-report form and a report whose text fields held
`<script>` and `<img onerror>` strings, which rendered escaped.

**CI gate (#805).** `.github/workflows/ci-surface.yml`, called from `ci-api.yml`,
builds `Dockerfile.deploy` (not pushed) and runs, inside that image against the
`timescaledb-ha` image from `docker-compose.yml`: `manage.py check --fail-level
WARNING`, `check --deploy`, `makemigrations --check --dry-run` and `manage.py
test` (which applies every migration to a fresh database). `CI Success` requires it
only when `scripts/ci/select-images.mjs` selects SURFACE: a change under
`surface/` or to that workflow, including on promotion PRs. `check --deploy`
warnings that are known and accepted are listed with their reasons in
`surface/ci/deploy-check-accepted.txt`; the job fails on an unlisted warning and on a
listed one that no longer appears. No tests are skipped. Host verification with
`docker-compose.yml` is still the check for the running stack (sign-in, pages,
Celery).

## wis2box/

Deployment configuration only (compose files, `wis2box-ctl.py`, monitoring
config) — the wis2box software itself runs from upstream Docker images, so this
folder cannot be "forked" in place. To make a GMS flavor of wis2box proper,
vendor its source repo and build our own images, then point the compose files
at them.

- Runs via `wis2box-ctl.py` on the **host**.
- Data directory lives outside the repo at `~/wis2box-data`
  (`WIS2BOX_HOST_DATADIR` in `wis2box.env`).
- Gitignored: `wis2box.env` (broker/storage/webapp passwords). Committed
  template: `wis2box.env.example`.

## geonetcast/

Training material from the GeoNetCast Americas (GNC-A) courses: GOES, NWP and
animation example scripts, Google Colab notebooks (outputs stripped; originals
in git history at `4c93c9d`), colour tables and FAZZT/NOVRA receiver notes.
It is licensed under the GNU GPL v3 (`geonetcast/LICENSE`).

- Reference only: nothing in the API or web apps imports it. Operational
  satellite processing lives in `scripts/gnc-collector`, which is written
  independently from NOAA's published GOES-R formulas and does not copy or
  import these GPL scripts. Keep it that way unless the owner accepts GPL
  terms for that package.
- Runs locally or in the devcontainer only; the weather image's `geonetcast`
  target is not published (see `infra/weather/README.md`).
- Gitignored: Natural Earth admin-1 shapefiles in `shared/` and the data and
  images the scripts download or render (see `geonetcast/README.md`).

## Upgrading a vendored app

1. Obtain the new upstream release (installer or setup zip).
2. Unpack it over the vendored folder in a clean working tree.
3. Review `git diff` — it shows exactly what upstream changed vs. our flavor.
4. Reconcile, test on the host stack, commit.
