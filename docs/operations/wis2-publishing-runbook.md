# WIS2 Publishing Runbook (SURFACE → wis2box)

Operational runbook for the observation publishing pipeline decided in
[ADR-0010](../adr/0010-wis2-publishing-via-surface-builtin.md). All commands run
on the **host** (both stacks are host Docker; the devcontainer has no docker
CLI). Secrets stay in `surface/api/production.env` and `wis2box/wis2box.env` —
never paste them into repo files, issues, or chat logs.

## Pipeline facts

| Fact | Value |
| --- | --- |
| Publisher | SURFACE Celery `wis2publish_task`, fires every 60 s |
| Per-station cadence | `Wis2PublishOffset.cron_schedule`, default `5 * * * *` (hh:05) |
| Transport | WMO CSV → S3 PUT → wis2box MinIO bucket `wis2box-incoming` |
| Object key prefix | `origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop` (must equal the wis2box dataset topic exactly) |
| Conversion | wis2box-management: csv2bufr → `.bufr4` in `wis2box-public` + WIS2 MQTT notification |
| Bridge address (SURFACE → wis2box MinIO) | `172.25.0.1:9000` — **verify before first use and after any Docker network change** (Stage 2.1 check below); `172.25.0.1` is the pinned `surface-net` gateway |
| Worker handling wis2 tasks | `surface-celery-worker-maintenance` (maintenance queue) |
| Data read | top-of-hour `raw_data` rows, **no QC filter** (ADR-0010) |
| Sandbox vs production | local wis2box broker is unregistered → cannot reach the global network; production cutover is gated (ADR-0010) |

Bridge reachability check (run before enabling publishing, and during triage):

```bash
docker exec surface-celery-worker-maintenance \
  curl -sf http://172.25.0.1:9000/minio/health/live && echo REACHABLE
```

## End-to-end verification checklist (per station, per hour)

Work down the list in order; the first failing point names the broken segment.

1. **Source** — top-of-hour row exists in SURFACE:
   ```bash
   docker exec -it surface-database psql -U dba -d surface_db -c \
    "SELECT variable_id, measured FROM raw_data
     WHERE station_id = <ID> AND datetime = date_trunc('hour', now() at time zone 'utc');"
   ```
2. **Publish** — newest SURFACE log row succeeded:
   ```bash
   docker exec -it surface-database psql -U dba -d surface_db -c \
    "SELECT created_at, success_log, left(log,120) FROM wx_wis2boxpublishlogs
     ORDER BY created_at DESC LIMIT 5;"
   ```
3. **Ingest** — CSV object under the topic prefix in `wis2box-incoming`
   (MinIO console `http://localhost:9001`).
4. **Convert** — `.bufr4` in `wis2box-public`; no errors in
   `docker logs wis2box-management --since 10m`.
5. **Notify** — WIS2 notification on MQTT during a publish window
   (`properties.data_id` contains the station WIGOS id):
   ```bash
   mosquitto_sub -h localhost -p 1883 -u wis2box -P '<broker pw from wis2box.env>' \
     -t 'origin/a/wis2/#' -C 1 -v
   ```
6. **Serve** — observation returned by the API and visible in the UI (:9999):
   ```bash
   curl -s "http://localhost/oapi/collections/<dataset-id>/items?limit=5"
   ```
7. **Monitor** — Grafana `http://localhost:3100`: received/published counters
   climb hourly.

## Failure triage map

| Symptom | Likely segment | Check |
| --- | --- | --- |
| SURFACE log row `success_log=false` / connection error | Credentials or network | Bridge reachability check; `LocalWisCredentials` row (IP/port only — never select password columns) |
| SURFACE log "no data" / filename `no_wsi_found_<id>` | Station data or metadata | Checklist point 1; `wx_station.wigos` populated? |
| CSV in `wis2box-incoming` but no BUFR | Topic/pattern/column mismatch | Dataset topic == key prefix character-for-character; file pattern matches `wmo_data_*.csv`; csv2bufr traceback in wis2box-management log — fix the mapping template in `~/wis2box-data/mappings/`, not SURFACE |
| BUFR published but station unmatched in UI | wis2box station list | Station present with the same WIGOS id; associated with the synop topic |
| Whole hours silently missing | Late station data | Publisher reads exactly top-of-hour; late-arriving rows are skipped for that hour (accepted, ADR-0010) — shows up as `publish_fail` count growth |

## Soak testing (internal phase, before real station data)

While no real feed exists, a host cron seeds synthetic top-of-hour obs for the
pilot station one minute past each hour (`scripts/wis2-setup/seed-hourly.sh`;
install line in that folder's README). 24 h soak pass criteria: ≥22/24 hourly
`success_log=true` rows in `wx_wis2boxpublishlogs`, `publish_fail` flat, one
`.bufr4` per success in `wis2box-public`, no ERRORs in `wis2box-management`
logs. Laptop sleep accounts for the 2-miss allowance — note actuals below.

## Change log

- 2026-07-08 — runbook created alongside ADR-0010; sandbox configuration in
  progress (values above to be re-verified during Stage 2 of the Phase 1 plan).
- 2026-07-08 (later) — pipeline verified end-to-end on the sandbox: SURFACE
  publish (station MBIA, `success_log=true` 22:52 UTC) → BUFR
  `WIGOS_0-20000-0-78958_20260708T220000.bufr4` in `wis2box-public` → WIS2
  notification in the messages collection. Bridge address `172.25.0.1:9000`
  verified live. csv2bufr template `Surface-RA-IV-100`; note its `visibility`
  CSV column is in **km** (template multiplies ×1000). 24 h soak: pending.
