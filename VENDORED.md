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
| `Django` | 3.2.13 | 4.2.x (`>=4.2,<4.3`, resolved 4.2.30) | #722 step 1 | Django 4.2 LTS. Step 2 goes to 5.2 |
| `djangorestframework`, `djangorestframework-simplejwt`, `django-celery-beat`, `django-cors-headers`, `django-import-export`, `django-material`, `django-simple-history`, `celery`, `kombu`, `amqp`, `redis` | older | see `requirements.in` | #722 step 1 | Raised to versions that support Django 4.2; `pymemcache` replaces `python-memcached` (Django 4.1 removed `MemcachedCache`) |
| `django-colorfield` | 0.4.5 | 0.4.5 (kept) | #722 step 1 | Newer versions change `ColorField` max_length 18 to 25 and need a migration; revisit in step 2 |

The transitive pins are edited in place in the pip-compiled `requirements.txt`.
If you re-run `pip-compile`, keep these versions as lower bounds.

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
