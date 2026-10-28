# gnc-collector

Turns GOES-19 files received by the Met office's GeoNetCast Americas (GNC-A)
receiver into Eastern Caribbean images in the WxWatch archive.

## Mental model

```text
Intelsat IS-21 (C-band, DVB-S2) → dish → DVB-S2 receiver → FAZZT client
                                                              │ writes NOAA files unchanged
                                                              ▼
                                   FAZZT output folder (read only to us)
                                                              │ every 10 minutes
                                                              ▼
gnc-collector collect → PNG per band → local archive or S3 bucket
                                     → metadata to FastAPI /api/v1/wxwatch (worker token)
```

GNC-A rebroadcasts NOAA's GOES-R ABI Level 2 Cloud and Moisture Imagery
(`OR_ABI-L2-CMIPF-…`) files without changing them, so the collector reads the
same files that sit in NOAA's public `noaa-goes19` bucket. The broadcast keeps
working when the office internet does not.

| Band | Product | Archive product key |
| --- | --- | --- |
| 13 | Clean infrared brightness temperature | `goes19-ir-caribbean` |
| 8 | Upper-level water vapour | `goes19-wv-caribbean` |

The area is 66–56° W, 9–18° N with a marker at Maurice Bishop International
Airport. Images are login-only in WxWatch (source `gnca`); the anonymous GMS
website endpoint stays limited to the existing `goes19` web source until the
owner decides otherwise.

## Behaviour

- Reads only full-disk (`CMIPF`) files from GOES-19 for the chosen bands,
  recursively under `--input-dir`, newest first.
- Skips files modified in the last 60 seconds: FAZZT may still be writing them.
- Reads only the Caribbean window of each full disk (a few hundred kilobytes,
  not the 5424 × 5424 array).
- Processes at most `--max-files` (default 12) per pass; one broken file is
  reported and retried on the next two passes, then given up on, and never
  stops the others.
- Remembers archived and given-up file names in `<work-dir>/processed.json`,
  so restarts and overlapping receiver retention never duplicate images. A
  damaged state file is set aside as `processed.corrupt`. A pass with nothing
  new opens no archive run. `--dry-run` keeps a separate
  `processed-dry-run.json`, so a trial never hides files from the real run.
- Sends credentials only over HTTPS, except to `localhost`; ignores symbolic
  links in the receiver folder.
- Never writes to, moves or deletes receiver files.

## Offline exercise in WSL

From the repository root, without a receiver, using a public NOAA file:

```bash
mkdir -p /tmp/gnc-in
# pick any recent key from https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=ABI-L2-CMIPF/
curl -o /tmp/gnc-in/<file>.nc https://noaa-goes19.s3.amazonaws.com/ABI-L2-CMIPF/<yyyy>/<doy>/<hh>/<file>.nc
touch -d '-5 min' /tmp/gnc-in/*.nc
uv run --isolated --frozen --package gnc-collector gnc-collector collect \
  --input-dir /tmp/gnc-in --work-dir /tmp/gnc-work --dry-run
```

`--dry-run` renders into `--work-dir/images` and never calls the API. The first
coastline render downloads Natural Earth 10 m coastlines into cartopy's data
folder; pass `--no-coastlines` on a machine without internet.

## Tests

```bash
cd scripts/gnc-collector
uv run --isolated --frozen --package gnc-collector python -m pytest tests
```

Fixtures are miniature netCDF files with the real GOES-19 projection; the
navigation maths is checked against the worked example in the GOES-R Product
User's Guide. `pnpm verify:collectors` runs this suite with the other
collectors.

## Live archiving

Environment (never commit values):

| Variable | Purpose |
| --- | --- |
| `WXWATCH_API_URL` | e.g. `https://<api-host>/api/v1/wxwatch` (HTTPS for remote) |
| `WXWATCH_INGEST_TOKEN` | the same ≥ 32-character worker token FastAPI uses |
| `STORAGE_ENDPOINT_URL`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | all four, or none for a local archive |
| `STORAGE_PREFIX`, `STORAGE_REGION` | optional; prefix defaults to `wxwatch` like scrapy-wxwatch |

FastAPI must already accept the `gnca` source. Receiver setup, the systemd
timer in `deploy/` and disk housekeeping are in
[docs/operations/geonetcast-receiver.md](../../docs/operations/geonetcast-receiver.md).
