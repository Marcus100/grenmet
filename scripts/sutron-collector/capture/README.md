# Phase A capture — field procedure

Two scripts to run **on the legacy `ppcr-maurice` PC** while it stays in
production. They gather everything the Python 3 port needs so the rest of the
work can be done offline, without a second trip to the machine.

Both are written for the legacy box's own Python 2 / bash. They install nothing
and add no dependencies.

| Script | Opens the serial port? | Safe to run any time? |
| --- | --- | --- |
| `harvest.sh` | No | **Yes** — pure read of the disk |
| `capture-serial.py` | **Yes** | No — must run in a gap between legacy polls |

## Safety properties

Both scripts refuse to write anywhere under the legacy tree, checked *before*
creating anything. Neither ever writes `FTP_Files/test_filename.txt`, which is
the sole trigger for CIMH delivery (`sendCIMH1.sh` reads it and sftps whatever
it names). Neither sends anything to the station or the network.

`capture-serial.py` additionally refuses to run unless:

- the legacy poller (`Sutron_Linux_V_5_3`) is absent from the process table,
- the current minute ends in 3, 4, 5 or 6 — at least three minutes clear of
  legacy's `:00,:10,:20,:30,:40,:50` schedule, and
- the port opens cleanly, requesting exclusive access where pyserial supports it.

Linux does not lock a tty by default, so two readers can silently interleave and
corrupt each other's data. The window check is the primary defence; the
exclusive open is the backstop.

## Step 1 — copy the scripts across

Put both files on a USB stick and mount it on the legacy PC. Do not copy them
into `/home/data/Sutron_Linux/`.

```bash
mkdir -p /tmp/sutron-capture-tools
cp /media/usb/harvest.sh /media/usb/capture-serial.py /tmp/sutron-capture-tools/
chmod +x /tmp/sutron-capture-tools/*
```

## Step 2 — harvest the disk (safe at any moment)

```bash
SKIP_HISTORY=1 /tmp/sutron-capture-tools/harvest.sh /media/usb/sutron-capture
```

`SKIP_HISTORY=1` leaves the bulk history database behind, keeping the capture
small enough to email. The schema, row counts and date range are still recorded,
and matched pairs are still built by querying the live database read-only — so
nothing needed to *build* the port is lost. Drop the flag when you want the
history itself, which is a separate, much larger trip.

### Scale

At Maurice Bishop, `FTP_Files/` held **217,700** `.asc` files — over four years
at one every ten minutes, never pruned. That is enough to defeat a shell glob
(`Argument list too long`), so the script uses `find` and copies a bounded
sample: the newest `ASC_RECENT` (default 300, the format CIMH receives today)
plus `ASC_SPREAD` (default 200) spaced evenly across history to catch older
format variants. The complete filename list is always saved to
`misc/asc-filenames.txt`, so nothing is lost track of.

Every value is tunable: `ASC_RECENT`, `ASC_SPREAD`, `PAIR_MAX`.

Writes a timestamped directory containing:

| Directory | Contents |
| --- | --- |
| `databases/` | `MAURICE_RASP_AWS.db` and `remote.db`, plus schema and row counts as text |
| `asc/` | every `.asc` in `FTP_Files/` — the golden-file corpus |
| `pairs/` | each `.asc` beside the `AWS` row legacy derived from it |
| `environment/` | crontabs, `stty`, `dmesg`, versions, serial port state |
| `logs/`, `misc/` | logs, spool files, `Daily/*.dat`, rendered HTML, full tree listing |

`MANIFEST.txt` records what was found; `checksums.txt` lets you verify the
transfer afterwards.

The databases are snapshotted with `sqlite3 .backup` when the CLI is present,
which is consistent against a live database. If the CLI is missing the script
falls back to `cp` and says so — a plain copy of a database written every ten
minutes can be torn, so prefer a box with `sqlite3` installed.

### If `MAURICE_RASP_AWS.db` lives elsewhere

```bash
LEGACY_ROOT=/path/to/Sutron_Linux /tmp/sutron-capture-tools/harvest.sh /media/usb/sutron-capture
```

## Step 3 — capture raw logger responses

The `.asc` files record what legacy *produced*; they do not record what the
logger actually *said*. Only this step captures the raw serial response, and it
is what lets the new parser be verified against reality.

Wait until the clock reads a minute ending in 3, 4, 5 or 6, then:

```bash
/tmp/sutron-capture-tools/capture-serial.py /media/usb/sutron-capture/serial --count 3
```

Each capture writes a `.bin` (raw bytes, byte-exact) and a `.meta.txt`
(timestamp, port settings, decoded text). The script stops on its own when the
safe window closes.

Repeat at several different times of day — Step 4 explains why.

If you have deliberately stopped the legacy poller and want to capture outside
the window:

```bash
/tmp/sutron-capture-tools/capture-serial.py /media/usb/sutron-capture/serial --force
```

Use `--port /dev/ttyS0` if the port differs from `/dev/ttyS1`.

## Step 4 — aim for matched triples

The most valuable artifact is a **matched triple** for one instant:

1. the raw serial response (Step 3),
2. the `.asc` legacy built from it,
3. the resulting `AWS` row.

`harvest.sh` already pairs (2) and (3) automatically — legacy's `Create_FTP`
shells straight into `db_ingester.py`, so they are causally linked. Adding (1)
requires capturing serial close to a legacy poll, then re-running `harvest.sh`
afterwards to pick up the `.asc` and row legacy produced.

A practical rhythm: capture serial at `:X5`, let legacy run at `:X0`, then
re-harvest. Ten to twenty triples across different hours make the whole pipeline
verifiable offline, byte for byte, forever.

The value shows up inside a single pair. A `.asc` holding `1500` next to a DB
row holding `15` pins the ×100 multiplier round-trip exactly.

## Step 5 — verify the transfer

On the receiving machine:

```bash
cd /media/usb/sutron-capture/sutron-capture-<host>-<stamp>
sha1sum -c checksums.txt
```

Then confirm a captured response parses with the current collector:

```bash
uv run --frozen --package sutron-collector sutron-collector fixture <captured>.bin
```

A good capture yields ~79 observations across 21 tags, including `LW`, `MD`,
`TB` and `VWC` — the four the legacy `AWS` table has no column for and silently
drops.

## Handling the results

Captured databases and logs may contain the CIMH auth key and other operational
detail. **This repository is public.** Keep the capture on removable media or a
private location; do not commit it. Only redacted excerpts belong in
`legacy/`, following the redaction table in `legacy/README.md`.
