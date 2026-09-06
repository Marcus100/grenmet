# Deploying alongside the legacy poller

Runs the collector on `ppcr-maurice` **while the legacy system stays in
production**. Nothing here touches `/home/data/Sutron_Linux`.

## The one hard constraint

Only one process can hold `/dev/ttyS1`. Legacy's cron opens it **23 times an
hour**, not the 6 its code suggests:

```
00 02 05 09 10 12 15 19 20 22 25 29 30 35 40 44 45 49 50 52 54 56 58
```

Most of those runs only refresh local files; only `:00 :10 :20 :30 :40 :50`
also write a `.asc` and a database row. The other cron jobs (`sendCIMH1.sh`,
`sendunsent.py`) transfer over the network and never touch the port.

The timer therefore fires at `:07 :17 :27 :37 :47 :57` — the free minutes at a
ten-minute cadence. Verify this against `crontab -l` before deploying; if
legacy's schedule has changed, recompute rather than assuming.

Do not enable `Persistent=true`: a catch-up burst after downtime could land on
top of a legacy poll.

## Blocker to resolve first: Python version

The collector requires Python 3.13. The edge PC runs Python 2 for the legacy
system and may have no suitable Python 3 at all.

Check what is there (the harvest already captured this in
`environment/python-version.txt`):

```bash
python3 --version
```

**Measured on ppcr-maurice (2026-08-15): Python 3.6.9**, on Ubuntu 18.04
(systemd 237). That is far below what the collector needs, and 3.6 is long out
of support.

**Do not upgrade the system Python** — the legacy system depends on what is
installed. Install a standalone interpreter instead, which leaves the system
untouched:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
~/.local/bin/uv python install 3.13
```

Outbound access was verified on 2026-08-15: `pypi.org` and `github.com` both
returned 200. Note `curl` is **not installed** on that machine and a plain
request to `astral.sh` returns 403 (its CDN blocks Python's default
user-agent) — neither indicates a network problem. Test with `python3` and a
host that does not filter by user-agent.

## Verified environment (ppcr-maurice, 2026-08-15)

| | |
| --- | --- |
| OS | Ubuntu 18.04, systemd 237 |
| System Python | 2.7.17 (legacy) and 3.6.9 |
| Timezone | AST (UTC−4), no daylight saving |
| Network | `10.0.30.2/24`, outbound internet working |
| Serial port | `/dev/ttyS1`, contended 23×/hour by legacy cron |

## Install

```bash
mkdir -p /home/data/sutron-ng/outgoing
cd /home/data/sutron-ng

uv venv --python 3.13 venv
./venv/bin/pip install /path/to/sutron_collector-*.whl

sudo cp sutron-collector.service sutron-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

The `data` user must be in the `dialout` group to open the serial port:

```bash
groups data | grep -q dialout || sudo usermod -aG dialout data
```

## Dry run before enabling the timer

Run once by hand, in a free minute (`:07 :17 :27 :37 :47`), and confirm a file
appears:

```bash
sudo systemctl start sutron-collector.service
journalctl -u sutron-collector.service -n 20 --no-pager
ls -l /home/data/sutron-ng/outgoing/
```

Then confirm the legacy system is unaffected — its own output should continue
appearing on the ten-minute mark:

```bash
ls -lt /home/data/Sutron_Linux/FTP_Files/*.asc | head -3
```

## Enable

```bash
sudo systemctl enable --now sutron-collector.timer
systemctl list-timers sutron-collector.timer
```

Confirm the next run is at :07, :17, :27, :37, :47 or :57.

## Rollback

One command, instant, no cleanup:

```bash
sudo systemctl disable --now sutron-collector.timer
```

The legacy system is untouched by this and keeps running either way.

## What the service is prevented from doing

`ProtectSystem=strict` with `ReadWritePaths=/home/data/sutron-ng/outgoing`
means the only writable location is the output directory. `ProtectHome=read-only`
makes `/home/data/Sutron_Linux` readable but not writable, so a bug in the
collector cannot damage the legacy system even by accident.

## Still to configure (outside this machine)

1. Somewhere for `outgoing/` to be served from by FTP — SURFACE **pulls**, it
   does not accept pushes.
2. A `StationFileIngestion` record in SURFACE: the FTP server, the folder,
   the Maurice Bishop station, `file_pattern` `surface_78958_*.csv`, decoder
   `SURFACE`, and `delete_from_server` set so files do not accumulate.
3. The three variables listed in `NEW_SURFACE_VARIABLES`
   (`PRESQFE`, `PRESQFF`, `WNDGUSTD`), created before the first ingestion.
