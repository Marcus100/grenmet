#!/bin/bash
#
# Read-only harvest of the legacy Sutron installation on ppcr-maurice.
#
# Reads from the legacy tree and writes ONLY into the destination directory you
# name. It never writes, moves, or deletes anything under the legacy root, and
# in particular never touches FTP_Files/test_filename.txt, which is the sole
# trigger for CIMH delivery.
#
# Usage:  ./harvest.sh /media/usb/sutron-capture
#
# Safe to run at any time, including while the legacy poller is running.

set -u

LEGACY_ROOT="${LEGACY_ROOT:-/home/data/Sutron_Linux}"

if [ $# -ne 1 ]; then
    echo "usage: $0 <destination-directory>" >&2
    echo "example: $0 /media/usb/sutron-capture" >&2
    exit 2
fi

DEST_ARG="$1"

# ---------------------------------------------------------------------------
# Guard: never write inside the legacy tree.
#
# The destination is resolved to an absolute path WITHOUT being created, so a
# rejected destination leaves no trace. Creating first and checking afterwards
# would itself write into the legacy tree.
# ---------------------------------------------------------------------------
resolve_abs() {
    target="$1"
    case "$target" in
        /*) ;;
        *) target="$(pwd)/$target" ;;
    esac

    # Walk up to the deepest ancestor that exists, resolve that for real
    # (following symlinks), then re-attach the not-yet-created remainder.
    existing="$target"
    suffix=""
    while [ ! -d "$existing" ] && [ "$existing" != "/" ]; do
        suffix="$(basename "$existing")${suffix:+/$suffix}"
        existing="$(dirname "$existing")"
    done

    resolved="$(cd "$existing" 2>/dev/null && pwd)"
    [ -n "$resolved" ] || return 1

    if [ -n "$suffix" ]; then
        echo "$resolved/$suffix"
    else
        echo "$resolved"
    fi
}

DEST_ABS=$(resolve_abs "$DEST_ARG")
if [ -z "$DEST_ABS" ]; then
    echo "FATAL: cannot resolve destination '$DEST_ARG'" >&2
    exit 1
fi

LEGACY_ABS=$(cd "$LEGACY_ROOT" 2>/dev/null && pwd)

if [ -z "$LEGACY_ABS" ]; then
    echo "FATAL: legacy root '$LEGACY_ROOT' not found." >&2
    echo "       Set LEGACY_ROOT=/path/to/Sutron_Linux and re-run." >&2
    exit 1
fi

case "$DEST_ABS/" in
    "$LEGACY_ABS"/*)
        echo "FATAL: destination '$DEST_ABS' is inside the legacy tree." >&2
        echo "       Refusing to write anything under $LEGACY_ABS." >&2
        exit 1
        ;;
esac

# Only now is it safe to create anything.
mkdir -p "$DEST_ABS" 2>/dev/null
if [ ! -d "$DEST_ABS" ]; then
    echo "FATAL: cannot create destination '$DEST_ABS'" >&2
    exit 1
fi

STAMP=$(date +%Y%m%d_%H%M%S)
HOST=$(hostname 2>/dev/null || echo unknown)
OUT="$DEST_ABS/sutron-capture-$HOST-$STAMP"

mkdir -p "$OUT/databases" "$OUT/asc" "$OUT/pairs" "$OUT/environment" \
         "$OUT/logs" "$OUT/misc"

MANIFEST="$OUT/MANIFEST.txt"

log() {
    echo "$*"
    echo "$*" >> "$MANIFEST"
}

note() {
    echo "$*" >> "$MANIFEST"
}

log "Sutron legacy harvest"
log "  host        : $HOST"
log "  started     : $(date)"
log "  legacy root : $LEGACY_ABS"
log "  destination : $OUT"
log ""

# ---------------------------------------------------------------------------
# 1. Databases  (A2)
#
# sqlite3's .backup takes a consistent snapshot of a live database. A plain cp
# of a database being written every 10 minutes can produce a torn file, so
# prefer .backup and fall back to cp only if the CLI is unavailable.
# ---------------------------------------------------------------------------
log "== Databases =="

HAVE_SQLITE=no
if command -v sqlite3 >/dev/null 2>&1; then
    HAVE_SQLITE=yes
else
    log "  WARNING: sqlite3 CLI not found; falling back to cp (torn-read risk)."
fi

# SKIP_HISTORY=1 leaves the bulk history database behind. The port does not
# need years of readings to be built -- only the schema, the sensor allowlist in
# remote.db, and a sample of .asc files. Skipping keeps the capture small enough
# to email. The history can be fetched later in its own trip.
SKIP_HISTORY="${SKIP_HISTORY:-0}"
HISTORY_DB="${HISTORY_DB:-MAURICE_RASP_AWS.db}"

copy_db() {
    db_src="$1"
    db_name=$(basename "$db_src")
    db_dst="$OUT/databases/$db_name"

    if [ ! -f "$db_src" ]; then
        log "  MISSING  $db_src"
        return
    fi

    if [ "$SKIP_HISTORY" = "1" ] && [ "$db_name" = "$HISTORY_DB" ]; then
        db_size=$(wc -c < "$db_src" | tr -d ' ')
        log "  SKIPPED  $db_name ($db_size bytes) - SKIP_HISTORY=1"
        log "           schema and row counts are still recorded below"
        return
    fi

    if [ "$HAVE_SQLITE" = yes ]; then
        if sqlite3 "$db_src" ".backup '$db_dst'" 2>>"$OUT/logs/sqlite-errors.txt"; then
            log "  snapshot $db_name ($(wc -c < "$db_dst") bytes)"
            return
        fi
        log "  .backup failed for $db_name; falling back to cp"
    fi

    if cp "$db_src" "$db_dst" 2>/dev/null; then
        log "  copied   $db_name ($(wc -c < "$db_dst") bytes, torn-read possible)"
    else
        log "  FAILED   $db_name"
    fi
}

for db in "$LEGACY_ABS"/Database/*.db; do
    [ -e "$db" ] || continue
    copy_db "$db"
done

# Record each database's schema and row counts as plain text, so the structure
# survives even if a binary file is unreadable later. Read from the SOURCE
# databases with read-only queries, so this still works for a skipped history
# database -- the schema is what the port needs, not the rows.
if [ "$HAVE_SQLITE" = yes ]; then
    for db in "$LEGACY_ABS"/Database/*.db; do
        [ -e "$db" ] || continue
        base=$(basename "$db" .db)
        {
            echo "=== schema: $base ==="
            sqlite3 "$db" ".schema" 2>&1
            echo
            echo "=== tables and row counts ==="
            for tbl in $(sqlite3 "$db" \
                "SELECT name FROM sqlite_master WHERE type='table';" 2>/dev/null); do
                cnt=$(sqlite3 "$db" "SELECT COUNT(*) FROM \"$tbl\";" 2>/dev/null)
                echo "$tbl: $cnt rows"
            done
            echo
            echo "=== date range (AWS) ==="
            sqlite3 "$db" \
                "SELECT MIN(RECORD_DATE), MAX(RECORD_DATE) FROM AWS;" 2>/dev/null
        } > "$OUT/databases/$base.schema.txt" 2>&1
        log "  described $base -> $base.schema.txt"
    done
fi
log ""

# ---------------------------------------------------------------------------
# 2. The .asc corpus  (A4)
#
# Read-only. test_filename.txt is copied for reference but never written.
#
# Legacy has written one .asc every 10 minutes since ~2020 and never pruned
# them, so this directory can hold hundreds of thousands of files -- enough that
# a shell glob exceeds ARG_MAX. Everything in them is already in the database;
# these files are needed only to verify the *format*. So take a bounded sample:
# the newest ASC_RECENT (current format, what CIMH receives today) plus
# ASC_SPREAD spaced evenly across the whole history (older format variants).
# ---------------------------------------------------------------------------
log "== CIMH .asc files =="

ASC_RECENT="${ASC_RECENT:-300}"
ASC_SPREAD="${ASC_SPREAD:-200}"

ASC_COUNT=0
if [ -d "$LEGACY_ABS/FTP_Files" ]; then
    # find, not a glob: immune to ARG_MAX.
    ASC_LIST="$OUT/misc/asc-filenames.txt"
    find "$LEGACY_ABS/FTP_Files" -maxdepth 1 -type f -name '*.asc' 2>/dev/null \
        | sort > "$ASC_LIST"
    ASC_TOTAL=$(wc -l < "$ASC_LIST" | tr -d ' ')
    log "  found $ASC_TOTAL .asc files in total"

    SAMPLE="$OUT/misc/asc-sampled.txt"
    : > "$SAMPLE"

    if [ "$ASC_TOTAL" -le $((ASC_RECENT + ASC_SPREAD)) ]; then
        cp "$ASC_LIST" "$SAMPLE"
        log "  small enough to take all of them"
    else
        # Newest ASC_RECENT: filenames are YYYYMMDD_HHMM.asc, so sort order is
        # chronological order.
        tail -n "$ASC_RECENT" "$ASC_LIST" >> "$SAMPLE"

        # Evenly spaced sample across the rest of history.
        step=$((ASC_TOTAL / ASC_SPREAD))
        [ "$step" -lt 1 ] && step=1
        awk -v s="$step" 'NR % s == 1' "$ASC_LIST" >> "$SAMPLE"

        sort -u "$SAMPLE" -o "$SAMPLE"
        log "  sampling newest $ASC_RECENT plus every ${step}th file across history"
    fi

    # Batch the copy: xargs runs a handful of cp calls, not one per file.
    tr '\n' '\0' < "$SAMPLE" \
        | xargs -0 -I{} cp {} "$OUT/asc/" 2>/dev/null
    ASC_COUNT=$(find "$OUT/asc" -type f -name '*.asc' | wc -l | tr -d ' ')
    log "  copied $ASC_COUNT .asc files (full filename list kept in misc/)"

    if [ -f "$LEGACY_ABS/FTP_Files/test_filename.txt" ]; then
        cp "$LEGACY_ABS/FTP_Files/test_filename.txt" "$OUT/misc/" 2>/dev/null
        log "  copied test_filename.txt (read-only; never written by this script)"
    fi
else
    log "  MISSING  $LEGACY_ABS/FTP_Files"
fi
log ""

# ---------------------------------------------------------------------------
# 3. Matched pairs  (A3)
#
# For each .asc, pull the AWS row legacy derived from it. Filenames are
# YYYYMMDD_HHMM.asc and RECORD_DATE is 'YYYY-MM-DD HH:MM:00', so the two can be
# joined directly. This gives .asc + DB row for the same instant; the raw serial
# response is captured separately by capture-serial.sh.
# ---------------------------------------------------------------------------
log "== Matched pairs (.asc + resulting DB row) =="

# Prefer our own snapshot; fall back to the live database (read-only SELECTs)
# when the history copy was skipped, so pairs are still built in light mode.
AWS_DB="$OUT/databases/$HISTORY_DB"
if [ ! -f "$AWS_DB" ]; then
    AWS_DB="$LEGACY_ABS/Database/$HISTORY_DB"
fi
PAIR_COUNT=0

PAIR_MAX="${PAIR_MAX:-300}"

if [ "$HAVE_SQLITE" = yes ] && [ -f "$AWS_DB" ]; then
    for asc in "$OUT"/asc/*.asc; do
        [ -e "$asc" ] || continue
        [ "$PAIR_COUNT" -ge "$PAIR_MAX" ] && break
        base=$(basename "$asc" .asc)

        # 20200312_1130 -> 2020-03-12 11:30:00
        d_part=$(echo "$base" | cut -d_ -f1)
        t_part=$(echo "$base" | cut -d_ -f2)
        [ ${#d_part} -eq 8 ] || continue
        [ ${#t_part} -eq 4 ] || continue

        rec_date="${d_part:0:4}-${d_part:4:2}-${d_part:6:2} ${t_part:0:2}:${t_part:2:2}:00"

        row=$(sqlite3 -header -line "$AWS_DB" \
            "SELECT * FROM AWS WHERE RECORD_DATE='$rec_date';" 2>/dev/null)

        if [ -n "$row" ]; then
            mkdir -p "$OUT/pairs/$base"
            cp "$asc" "$OUT/pairs/$base/observed.asc"
            {
                echo "# RECORD_DATE queried: $rec_date"
                echo "# source .asc: $base.asc"
                echo
                echo "$row"
            } > "$OUT/pairs/$base/db-row.txt"
            PAIR_COUNT=$((PAIR_COUNT + 1))
        fi
    done
    log "  built $PAIR_COUNT matched pairs"
    if [ "$PAIR_COUNT" -eq 0 ] && [ "$ASC_COUNT" -gt 0 ]; then
        log "  NOTE: no .asc timestamp matched a DB row. Check that RECORD_DATE"
        log "        format is 'YYYY-MM-DD HH:MM:00' in this deployment."
    fi
else
    log "  SKIPPED (needs sqlite3 and MAURICE_RASP_AWS.db)"
fi
log ""

# ---------------------------------------------------------------------------
# 4. Environment and cadence ground truth  (A5)
# ---------------------------------------------------------------------------
log "== Environment =="

capture() {
    label="$1"
    filename="$2"
    outfile="$OUT/environment/$filename"
    shift 2
    if "$@" > "$outfile" 2>&1; then
        log "  captured $label"
    else
        log "  captured $label (command reported an error; see $filename)"
    fi
}

capture "uname"          uname.txt            uname -a
capture "os release"     os-release.txt       cat /etc/os-release
capture "uptime"         uptime.txt           uptime
capture "disk usage"     df.txt               df -h
capture "date"           date.txt             date
capture "timezone"       timezone.txt         cat /etc/timezone
capture "python version" python-version.txt   python -V

{
    echo "=== pyserial ==="
    python -c "import serial; print(serial.VERSION)" 2>&1
    echo
    echo "=== python path ==="
    which python 2>&1
} > "$OUT/environment/python-serial.txt" 2>&1
log "  captured pyserial version"

# Cron: the real cadence contract.
capture "crontab (current user)" crontab-current.txt crontab -l
{
    echo "=== crontab -l -u data ==="
    crontab -l -u data 2>&1
    echo
    echo "=== crontab -l -u root ==="
    crontab -l -u root 2>&1
    echo
    echo "=== /etc/crontab ==="
    cat /etc/crontab 2>&1
    echo
    echo "=== /etc/cron.d/ ==="
    ls -la /etc/cron.d/ 2>&1
    for f in /etc/cron.d/*; do
        [ -e "$f" ] || continue
        echo "--- $f ---"
        cat "$f" 2>&1
    done
} > "$OUT/environment/cron-all.txt" 2>&1
log "  captured cron configuration"

# Serial port facts.
{
    echo "=== stty -F /dev/ttyS1 -a ==="
    stty -F /dev/ttyS1 -a 2>&1
    echo
    echo "=== /dev/serial/by-id ==="
    ls -l /dev/serial/by-id/ 2>&1
    echo
    echo "=== ttyS* devices ==="
    ls -l /dev/ttyS* 2>&1
    echo
    echo "=== dmesg (tty/serial) ==="
    dmesg 2>&1 | grep -i -E "tty|serial|8250" | tail -40
    echo
    echo "=== processes holding /dev/ttyS1 ==="
    fuser -v /dev/ttyS1 2>&1
    echo
    echo "=== legacy poller running? ==="
    ps -ef 2>&1 | grep -i "[S]utron_Linux"
} > "$OUT/environment/serial.txt" 2>&1
log "  captured serial port state"
log ""

# ---------------------------------------------------------------------------
# 5. Logs and remaining artifacts  (A5)
# ---------------------------------------------------------------------------
log "== Logs and other artifacts =="

# Legacy appends to these every 10 minutes and prints verbosely, so they reach
# gigabytes over years -- at Maurice Bishop, 2.9 GB across four files. Only the
# tail is useful, so cap each at LOG_TAIL_BYTES and record the true size.
LOG_TAIL_BYTES="${LOG_TAIL_BYTES:-5000000}"

for logdir in /home/data/log "$LEGACY_ABS/log"; do
    [ -d "$logdir" ] || continue
    for f in "$logdir"/*; do
        [ -f "$f" ] || continue
        base=$(basename "$f")
        full_size=$(wc -c < "$f" 2>/dev/null | tr -d ' ')

        if [ "${full_size:-0}" -gt "$LOG_TAIL_BYTES" ]; then
            tail -c "$LOG_TAIL_BYTES" "$f" > "$OUT/logs/$base" 2>/dev/null \
                && log "  copied log $base (tail only; full size $full_size bytes)"
        else
            cp "$f" "$OUT/logs/" 2>/dev/null && log "  copied log $base"
        fi

        echo "$base: $full_size bytes" >> "$OUT/logs/original-sizes.txt"
    done
done

# KaleidoScope raw packet debug output (ks.config sets raw=True).
if [ -f "$LEGACY_ABS/KaleidoScope/raw.txt" ]; then
    cp "$LEGACY_ABS/KaleidoScope/raw.txt" "$OUT/misc/" 2>/dev/null
    log "  copied KaleidoScope/raw.txt"
fi

# Spool files: the offline retry queue.
for spool in "$LEGACY_ABS"/Script/unsent_server*.txt; do
    [ -e "$spool" ] || continue
    cp "$spool" "$OUT/misc/" 2>/dev/null && log "  copied $(basename "$spool")"
done

# Daily .dat aggregates and the rendered HTML page.
if [ -d "$LEGACY_ABS/Daily" ]; then
    mkdir -p "$OUT/misc/Daily"
    cp "$LEGACY_ABS"/Daily/*.dat "$OUT/misc/Daily/" 2>/dev/null
    log "  copied Daily/*.dat ($(ls -1 "$OUT/misc/Daily" 2>/dev/null | wc -l) files)"
fi

if [ -f "$LEGACY_ABS/HTML/index.html" ]; then
    cp "$LEGACY_ABS/HTML/index.html" "$OUT/misc/" 2>/dev/null
    log "  copied HTML/index.html"
fi

# A listing of the legacy tree, so anything missed is at least known about.
# FTP_Files is deliberately summarised rather than listed: it can hold hundreds
# of thousands of entries, and its full filename list is already in misc/.
# FTP_Files is excluded from every walk here, not merely summarised: it can hold
# hundreds of thousands of entries, and even `du -sh` over it stats every one,
# which takes minutes on the edge PC's disk. Its filename list is already in
# misc/asc-filenames.txt, and the count is already known.
{
    echo "=== directories ==="
    find "$LEGACY_ABS" -type d ! -path "*/FTP_Files*" 2>/dev/null | sort
    echo
    echo "=== all files except FTP_Files ==="
    find "$LEGACY_ABS" -type f ! -path "*/FTP_Files/*" -exec ls -la {} + 2>/dev/null
    echo
    echo "=== FTP_Files summary ==="
    echo "total .asc files: $ASC_TOTAL"
    echo "oldest .asc: $(head -1 "$OUT/misc/asc-filenames.txt" 2>/dev/null)"
    echo "newest .asc: $(tail -1 "$OUT/misc/asc-filenames.txt" 2>/dev/null)"
    echo "(not size-scanned: stat-ing this many files takes minutes)"
} > "$OUT/misc/legacy-tree-listing.txt" 2>&1
log "  captured legacy tree listing (FTP_Files excluded from the walk)"
log ""

# ---------------------------------------------------------------------------
# 6. Integrity
# ---------------------------------------------------------------------------
log "== Integrity =="

SUMTOOL=""
if command -v sha1sum >/dev/null 2>&1; then
    SUMTOOL=sha1sum
elif command -v md5sum >/dev/null 2>&1; then
    SUMTOOL=md5sum
fi

if [ -n "$SUMTOOL" ]; then
    # -exec ... {} + batches many files per process. The \; form spawns one
    # process per file, which is minutes of overhead over a large capture.
    ( cd "$OUT" && find . -type f ! -name checksums.txt -exec "$SUMTOOL" {} + ) \
        > "$OUT/checksums.txt" 2>/dev/null
    log "  wrote checksums.txt using $SUMTOOL"
else
    log "  no checksum tool available"
fi

TOTAL=$(find "$OUT" -type f | wc -l)
SIZE=$(du -sh "$OUT" 2>/dev/null | cut -f1)

note ""
note "finished    : $(date)"
note "total files : $TOTAL"
note "total size  : $SIZE"

echo ""
echo "Harvest complete."
echo "  files : $TOTAL"
echo "  size  : $SIZE"
echo "  path  : $OUT"
echo ""
echo "Nothing under $LEGACY_ABS was modified."
echo "Next: run capture-serial.sh in a gap window for raw logger responses."
