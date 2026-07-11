# Vendored applications

Third-party applications vendored into this monorepo as GMS-owned copies
(fork-and-own). Upstream git history is not retained, so provenance is recorded
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
