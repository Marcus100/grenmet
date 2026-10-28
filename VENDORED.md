# Vendored applications

Third-party applications vendored into this monorepo as maintained copies
(fork-and-maintain). They keep their upstream licences. Upstream git history is not retained, so provenance is recorded
here — future upgrades or upstream-fix ports are done by diffing against the
recorded upstream release.

| Folder     | Upstream                                    | Version | Vendored   |
| ---------- | ------------------------------------------- | ------- | ---------- |
| `surface/` | SURFACE CDMS (installed via `surface-cdms`) | 1.0.0   | 2026-07-08 |
| `wis2box/` | WMO wis2box setup bundle                    | 1.3     | 2026-07-08 |

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

Step 1 moved SURFACE from Django 3.2.13 to Django 4.2 (`>=4.2,<4.3`, resolved
4.2.30). Django 4.2 support ended in April 2026 and 4.2.30 is the final
release, so this step is intermediate: step 2 (Django 5.2) is still required.
Django 5.2 needs PostgreSQL 14 or newer, and both compose files pin
`timescale/timescaledb-postgis:2.3.0-pg13`, so a database upgrade is a
prerequisite for step 2.

| Package | Upstream | Ours | Note |
| --- | --- | --- | --- |
| `Django` | 3.2.13 | 4.2.30 | Final 4.2 release |
| `djangorestframework`, `djangorestframework-simplejwt`, `django-celery-beat`, `django-cors-headers`, `django-import-export`, `django-material`, `django-simple-history`, `celery`, `kombu`, `amqp`, `redis` | older | see `requirements.in` | Raised to versions that support Django 4.2 |
| `tablib` | 3.9.0 | 3.5.0 | Downgrade forced by `django-import-export` 3.3.9 |
| `pymemcache` | `python-memcached` | 4.0.0 | Replaces `python-memcached`; Django 4.1 removed `MemcachedCache` (settings use `PyMemcacheCache`) |
| `django-colorfield` | 0.4.5 | 0.4.5 (kept) | Newer versions change `ColorField` max_length 18 to 25 and need a migration; revisit in step 2 |

`Dockerfile.deploy` now installs `api/requirements.txt` on top of the upstream
`surface-base` image; before that the pins never reached a running container.

**No CI gate covers SURFACE.** `scripts/ci/select-images.mjs` treats `surface/`
as deferred and no workflow runs its tests, so verification on the host stack
(`surface/docker-compose.yml` or the weather compose) is the only gate. Run
`wx/tests` with the `manage.py test` command inside the built image too.

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

## Upgrading a vendored app

1. Obtain the new upstream release (installer or setup zip).
2. Unpack it over the vendored folder in a clean working tree.
3. Review `git diff` — it shows exactly what upstream changed vs. our flavor.
4. Reconcile, test on the host stack, commit.
