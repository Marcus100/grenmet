# Sutron Collector

A Python 3 edge collector for the Sutron automatic weather station at Maurice
Bishop International Airport.

## Mental model

```text
Sutron logger ← RF → Digi XTend ← RS-232 → Linux edge collector
                                               │
                                               └─ structured observations
```

The Digi modem behaves like a transparent serial cable. The collector writes
`show /tag /c\r\n` at 9600 baud, reads the tagged logger response, and turns
each valid row into an observation.

A row such as:

```text
QNH  1011.8  G  OK
```

is retained as the tag `QNH`, the exact decimal value `1011.8`, and both
status tokens `G` and `OK`. Their meanings are deliberately not guessed.
Unknown tags such as `MD` are retained rather than discarded.

## Offline exercise in WSL

From the repository root:

```bash
uv run --package sutron-collector sutron-collector fixture \
  scripts/sutron-collector/tests/fixtures/show_tag_c.txt
```

This uses the captured station response and does not open a serial port.

## Live Linux polling

Only use this after stopping or disabling every legacy process that can open
the same port:

```bash
uv run --package sutron-collector sutron-collector poll --port /dev/ttyS1
```

Defaults match the discovered installation: 9600 baud, 8 data bits, no parity,
1 stop bit, no flow control, a 5-second timeout, station
`MAURICEBISHOPINTL`, and station ID `13000`.

Never allow two processes to poll the same serial port simultaneously.

For a durable local archive and SURFACE handoff, supply both paths:

```bash
uv run --package sutron-collector sutron-collector poll \
  --port /dev/ttyS1 --format surface --station-code 78958 \
  --store /home/data/sutron-ng/archive/observations.db \
  --output-dir /home/data/sutron-ng/outgoing
```

The poll is saved to SQLite before its SURFACE CSV is written. If export fails,
the original reading and logger status tokens remain in the archive. The CSV
uses poll time, not a verified logger measurement time; off-hour polls must not
be presented as top-of-hour observations for WIS2 publication.

To recreate a missing handoff after fixing an export error, use the exact
`observed_at` timestamp from the SQLite archive:

```bash
sutron-collector replay \
  --store /home/data/sutron-ng/archive/observations.db \
  --collected-at 2026-08-15T14:07:03+00:00 \
  --output-dir /home/data/sutron-ng/outgoing
```

Confirm that SURFACE has not already ingested that poll before replaying it.

## Phase 1 boundary

Included:

- real-capture parsing;
- exact logger command;
- bounded attempts;
- explicit serial settings;
- fixture and fake-transport tests;
- JSON output for inspection;
- durable SQLite storage, SURFACE CSV handoff, and manual replay;
- systemd service and timer templates for a verified edge host.

Deferred until the hardware boundary is proven:

- PostgreSQL/FastAPI ingestion;
- automatic replay of archived polls after a failed handoff;
- CIMH SFTP delivery;
- historical SQLite migration.
