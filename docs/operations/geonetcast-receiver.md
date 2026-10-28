# GeoNetCast Americas Receiver Runbook

**Status:** Draft — receiver installed; collector not yet deployed  
**Owner:** GMS (receiver and data); maintained by Barrels Grenada  
**Last updated:** 2026-10-27

The Met office runs a GeoNetCast Americas (GNC-A) receiving station on a
separate Linux PC on the office network. This runbook covers what it receives,
how [`scripts/gnc-collector`](../../scripts/gnc-collector/README.md) turns
GOES-19 files into WxWatch images, and the housekeeping the station needs.
Hostnames, IP addresses, accounts and credentials stay out of this public
repository; record them in `/private/` or the owner's password manager.

## What GNC-A is

GNC-A is a free, one-way satellite broadcast run by NOAA with partners such as
INPE. It carries environmental satellite data, model output and other
products in DVB-S2 on transponder 19C of Intelsat IS-21 (58° W, C-band). A
station needs a dish, LNB, DVB-S2 receiver and the Kencast FAZZT Professional
Client, which writes each product to disk **in its original format,
unchanged**. Products are grouped into channels that the station switches on
or off.

Why it matters here:

- **Works without the internet.** Imagery keeps arriving during an office or
  island-wide connectivity outage, which is exactly when forecasters need it.
- **Raw science files.** GOES-19 arrives as NOAA's full-resolution netCDF, so
  we can make our own Caribbean crops and enhancements instead of copying
  pre-rendered web images.
- **Model data.** NWP output (GRIB) on the broadcast can feed the research
  notebooks in `notebooks/`, following the examples in `geonetcast/NWP/`.

References: [GNC-A architecture and coverage](https://www.geonetcastamericas.noaa.gov/architecture-and-coverage.html),
[product list](https://www.geonetcastamericas.noaa.gov/docs/GNC-A%20Product%20List%20-%20v2019-07-02.pdf),
[tutorials](https://www.geonetcastamericas.noaa.gov/tutorials.html). The
public product lists predate GOES-19; the station's own channel list is the
authority.

## First survey (record results in `/private/`)

Run on the receiver PC and keep the output:

```bash
hostnamectl                      # distribution and version
df -h                            # disk headroom
systemctl list-units --type=service | grep -i -E 'fazzt|kencast'
find / -name 'OR_ABI-L2-CMIP*' -mmin -60 2>/dev/null | head   # where GOES files land
find / \( -name '*.grib2' -o -name '*.grb2' \) -mmin -360 2>/dev/null | head
```

Answer these before deploying the collector:

1. The FAZZT output folder for GOES-R files, and how long files are kept.
2. Which channels are enabled, and whether GOES-19 full-disk `CMIPF` bands 8
   and 13 arrive every ten minutes.
3. Which NWP models and fields arrive (GRIB), and how often.
4. Whether this PC can reach the API over HTTPS, or only the office network.
5. Whether NOAA LRGS or the existing path is the authoritative source for the
   automatic weather station feed (see the WIS2 roadmap).

## Network access

Preferred: SSH from an office machine with key-only login, no password login,
and the PC kept off any public address. Do not open inbound ports from the
internet. The collector only needs **outbound** HTTPS to the API and object
storage, so the receiver never needs to accept connections for it.

## Deploying the collector

1. Create an unprivileged `gnc` user that can read the FAZZT output folder.
2. Install `uv`, then copy `scripts/gnc-collector` to `/opt/gnc-collector` and
   run `uv sync --frozen` there (uv supplies Python 3.14 even on an older
   distribution). Pre-download cartopy's 10 m coastlines once, or run with
   `--no-coastlines` if the PC has no internet.
3. Prove it offline: `gnc-collector collect --input-dir <fazzt-folder>
   --work-dir /var/lib/gnc-collector --dry-run`, then look at the PNGs.
4. Put `WXWATCH_API_URL`, `WXWATCH_INGEST_TOKEN` and the four `STORAGE_*`
   values in `/etc/gnc-collector/env` (mode 600, owned by root). The API must
   already accept the `gnca` source.
5. Copy `deploy/gnc-collector.service` and `.timer` to `/etc/systemd/system/`,
   set the real `--input-dir`, then `systemctl enable --now gnc-collector.timer`.
6. Check: `journalctl -u gnc-collector -n 50` shows `archived gnca/...` lines
   and the images appear in the WxWatch gallery.

## Housekeeping

- **FAZZT database:** the vendor procedures in
  `geonetcast/GNC-A Hardware and Software/FAZZT/GENERAL PROCEDURES/` clean and
  reset the FAZZT database. Follow them as written; the collector never
  touches FAZZT files.
- **Disk:** received data grows continuously. Use FAZZT's own retention or a
  dated cleanup of the output folder that keeps at least a day; the collector
  only needs files for about an hour.
- **Collector work folder:** rendered images under
  `/var/lib/gnc-collector/images` are copies of what is in the archive; they
  can be pruned after upload. `processed.json` must be kept.

## Failure signs

| Symptom | Likely cause | First check |
| --- | --- | --- |
| No new `archived` lines | Broadcast or FAZZT stopped, or wrong `--input-dir` | Newest `OR_ABI-L2-CMIPF` file time |
| `failed …: OSError` lines | Truncated file written during a reception error | Same file is retried next pass; persistent → FAZZT logs |
| `Archive API returned HTTP 401` | Token mismatch | Token in `/etc/gnc-collector/env` vs FastAPI |
| `HTTP 409` | Previous run still open, or source not enabled | Wait for lease expiry; API version |
| `HTTP 422` | API does not yet accept `gnca` | Deploy the API change first |

## Not yet decided

- Whether GNC-A images may appear on the anonymous GMS website (today only
  the `goes19` web source is public). Owner decision.
- Which additional products to automate (visible band, true colour,
  rainfall rate, lightning, NWP charts) after the first two run reliably.
- Monitoring and alerting for receiver staleness (follows the integration
  roadmap's failure-alerting exit criterion).
