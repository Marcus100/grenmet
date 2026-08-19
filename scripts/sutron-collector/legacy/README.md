# Legacy Sutron reference snapshot

Reference only. **Nothing here is imported, executed, linted, type-checked, or
packaged.** It is Python 2 and will not run on this repository's toolchain.

This is the code that ran on the `ppcr-maurice` edge machine at Maurice Bishop
International Airport, preserved so Phase 2 of `sutron-collector` has a source of
truth for the behaviour it replaces.

## Provenance

Captured from `data@ppcr-maurice:/home/data/` on 2026-07-19 as three tarballs,
deduplicated here into one tree. The bundles remain gitignored at the repository
root (`/ppcr-maurice-*.tar.gz`) and are the unredacted originals.

| Bundle | Contributed |
| --- | --- |
| `ppcr-maurice-port.tar.gz` | `Script/` |
| `ppcr-maurice-final-code.tar.gz` | `Database/`, `FTP_Files/sendToCIMH1.sh` |
| `ppcr-maurice-extra.tar.gz` | `FTP_Files/sendCIMH1.sh`, `sutron-serial-sample.txt` |

`Database/db_ingester.py` was byte-identical across two bundles. Compiled
`.pyc` files were dropped. Station SQLite databases were excluded at capture
time (`--exclude='*.db'`), so `remote.db` and `MAURICE_RASP_AWS.db` are absent.

## Redactions

This repository is public. Five secrets were replaced with named placeholders.
The originals are in the gitignored tarballs.

| File | Was | Now |
| --- | --- | --- |
| `Script/Sutron_Linux_V_5_3.py:566` | plaintext FTP host, user and password | `'FTP_ADDRESS','USER','PASSWORD'` |
| `Script/KaleidoScope2.py:29` | hardcoded remote ingest URL | `http://REMOTE_HOST:REMOTE_PORT/coral` |
| `Script/ks.config:2` | same remote ingest URL | `http://REMOTE_HOST:REMOTE_PORT/coral` |
| `FTP_Files/sendToCIMH1.sh:12` | CIMH sftp port, user and host | `CIMH_PORT`, `CIMH_USER@CIMH_HOST` |
| `Script/unsent_server{1,2}.txt` | remote auth key on every row (12 rows) | `key=REMOTE_AUTH_KEY` |

The FTP credential was live at capture time and should be treated as
compromised regardless of this redaction — the bundle travelled over several
hops to reach this repository.

Note that `Sutron_Linux_V_5_3.py:549` already read `'FTP_ADDRESS','USER',
'PASSWORD'` in the original. That is upstream placeholder text in a dead code
path, not a redaction of ours.

## What the old system did

```text
Sutron logger ──RF──> Digi XTend ──RS-232──> ppcr-maurice (this code)
                                                  │
                                    ┌─────────────┼──────────────┐
                                    ▼             ▼              ▼
                              SQLite (local)  CIMH (sftp)   Coral (HTTP POST)
```

`Script/Sutron_Linux_V_5_3.py` is the 37 KB main loop — polls the logger, then
fans out to HTML rendering, file export, SQLite ingest, and two remote sinks.
Feature flags live in `Script/sutron_linux.ini`; on the captured machine
`SFTPsend=1`, `DatabaseSend=1`, `FTPSend=0`, `MOCsend=0`.

| Path | Role |
| --- | --- |
| `Script/Sutron_Linux_V_5_3.py` | main poll loop and dispatch |
| `Script/sutron_linux.ini` | live station config — port `/dev/ttyS1`, 9600 baud, 5 s timeout, station `MAURICEBISHOPINTL`, multiplier 100 |
| `Script/KaleidoScope.py` | HTTP sink; reads sensor allowlist and auth key from `remote.db` |
| `Script/KaleidoScope2.py` | second HTTP sink, endpoint hardcoded rather than from config |
| `Script/sendunsent.py` | spool drain for `unsent_server1.txt` |
| `Script/unsent_server{1,2}.txt` | offline spool — one `key=…,SENSOR=value,…,time=YYYYMMDDHHMM` row per failed send |
| `Database/make_db.py` + `make_db.conf` | creates the `AWS` table; column list is the canonical sensor set |
| `Database/db_ingester.py` + `db_ingester.conf` | file → SQLite ingest; divisor 100, station ID 13000 |
| `Database/make_remote.sql` | `Remote(ID, Auth, Sensors)` — the auth key and allowlist table |
| `Database/add_db.conf` | a second `CIMH_SOIL` table (soil moisture/temp/EC/SP), station ID differs |
| `FTP_Files/sendToCIMH1.sh` | sftp upload; writes to a temp name then renames, so CIMH never sees a partial file |
| `FTP_Files/sendCIMH1.sh` | cron wrapper that reads the filename to send and calls the above |
| `sutron-serial-sample.txt` | the real captured `show /tag /c` response the Phase 1 parser was built against |

Two details worth carrying into Phase 2: the sftp upload's write-then-rename is
deliberate atomicity, and `db_ingester_manual.conf` shows the same code running
on a Raspberry Pi (`/home/pi`, divisor 1000, station ID 10001) — the divisor and
station ID are per-deployment, not constants.

## Relationship to `sutron-collector`

The Phase 1 collector in `../src/` is a clean-room Python 3 rewrite built from
`sutron-serial-sample.txt`, not a translation of this code. It currently covers
polling and parsing only. Ingestion, spooling, CIMH export, and deployment are
deferred; this tree is the reference for what they have to do.
