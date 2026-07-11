# wis2box sandbox setup (Phase 1, Stage 1)

Staging artifacts for configuring the local wis2box sandbox. Context:
[ADR-0010](../../docs/adr/0010-wis2-publishing-via-surface-builtin.md) ·
[runbook](../../docs/operations/wis2-publishing-runbook.md).

Contents:

- `Surface-RA-IV-100.json` — csv2bufr mapping template (vendored from
  [csv2bufr-templates](https://github.com/World-Meteorological-Organization/csv2bufr-templates)).
  Verified: every column it reads exists in SURFACE's publisher output
  (`surface/api/wx/tasks.py` `data_row`), so no custom mapping is needed.
- `test-data/wmo_data_0-20000-0-78958.csv` — one synthetic observation for the
  pilot station (MBIA), header generated from SURFACE's exact column order.
- `dryrun-upload.sh` — uploads the test file into `wis2box-incoming` via S3,
  exactly as SURFACE will. Reads credentials from `wis2box/wis2box.env` at
  runtime; no secrets stored here.

Also here (CLI path — no webapp needed):

- `metadata-synop-gd-metservice.yml` — discovery metadata (MCF) defining the
  synop dataset, topic, and csv2bufr data mapping (format taken from wis2box
  1.3's own examples/CI fixtures). Contact fields marked TODO must be set
  before production cutover.
- `station_list_gd.csv` — pilot station row in wis2box's station-list format.

## Host steps (CLI, in order)

```bash
# 1. Copy the artifacts into the wis2box datadir (owned by uid 1001 → sudo)
sudo cp ~/grenmet/scripts/wis2-setup/Surface-RA-IV-100.json ~/wis2box-data/mappings/
sudo cp ~/grenmet/scripts/wis2-setup/metadata-synop-gd-metservice.yml ~/wis2box-data/metadata/discovery/
sudo cp ~/grenmet/scripts/wis2-setup/station_list_gd.csv ~/wis2box-data/metadata/station/

# 2. Publish dataset + stations from inside the management container
cd ~/grenmet/wis2box
python3 wis2box-ctl.py login

wis2box auth add-token --path processes/wis2box    # save output privately (webapp editors need it later)
wis2box metadata discovery publish /data/wis2box/metadata/discovery/metadata-synop-gd-metservice.yml
wis2box metadata station publish-collection \
  --path /data/wis2box/metadata/station/station_list_gd.csv \
  --topic-hierarchy gd-metservice/data/core/weather/surface-based-observations/synop
exit

# 3. Dry-run ingest (or ask the agent to run it from the devcontainer)
~/grenmet/scripts/wis2-setup/dryrun-upload.sh
docker logs wis2box-management --tail 30           # expect csv2bufr success
```

Webapp alternative: `http://localhost/wis2box-webapp` (dataset editor +
station editor, token from step 2). Useful later for adding stations with
OSCAR autofill.

## Soak test: hourly self-seeding (internal testing phase)

The publisher fires at hh:05 and needs top-of-hour rows in both `raw_data` and
`hourly_summary`. During internal testing (no real station feed yet), a host
cron seeds synthetic hour-varying values with zero host dependencies:

- `seed-hourly.sql` — upserts the current hour's obs for station id 1
  (timestamp computed in SQL; safe to re-run).
- `seed-hourly.sh` — cron wrapper (`docker exec … psql`, flock-guarded).
- `seed-surface-obs.py` — same thing for ad-hoc runs from the devcontainer.

Install on the host (`crontab -e`):

```
1 * * * * /home/eugine/grenmet/scripts/wis2-setup/seed-hourly.sh >> /tmp/wis2-seed.log 2>&1
```

Soak pass criteria (24 h, see runbook): ≥22/24 hourly successes in
`wx_wis2boxpublishlogs`, one `.bufr4` per success in `wis2box-public`, no
ERRORs in `wis2box-management` logs. Remove the crontab entry when a real
station feed replaces the seeder.

Pilot station identity (must match SURFACE exactly when SURFACE is seeded):
Maurice Bishop Intl Airport · WIGOS `0-20000-0-78958` · WMO `78958` ·
lat `12.0042` lon `-61.7862` · elevation `12.0 m`.
