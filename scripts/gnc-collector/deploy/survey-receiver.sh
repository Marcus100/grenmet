#!/usr/bin/env bash
# Read-only survey of a GeoNetCast Americas receiver PC.
#
# Run it on the receiver and keep the output for the owner. It changes nothing:
# no files are written, and it reads no file contents (apart from the PRETTY_NAME line of /etc/os-release), no configuration, no
# environment variables and no process arguments. It prints process names, but
# never their arguments, so a password on a command line cannot leak.
#
# The output does identify the machine (IP addresses, the names of folders and
# files). Keep it in /private/ or the owner's notes, never in a public
# repository or chat.
#
#   bash survey-receiver.sh > survey-$(date +%F).txt 2>&1
#
# Optional settings (absolute paths only):
#   SEARCH_ROOTS="/data /var"   where to look for received files (default /)
#   SURVEY_FOLDER=/path         list this folder in detail
#   WINDOW_MIN=120              what counts as "recent", in minutes
#   FIND_TIMEOUT=300            seconds allowed for each search
#
# The searches skip only virtual file systems (/proc, /sys, devices) and network
# mounts, so data on a separate drive or a RAM disk is still found. They run at
# low priority and say so when one runs out of time, so "0 files" is never a guess.
set -u

WINDOW_MIN="${WINDOW_MIN:-120}"
FIND_TIMEOUT="${FIND_TIMEOUT:-300}"
SEARCH_ROOTS="${SEARCH_ROOTS:-/}"
SURVEY_FOLDER="${SURVEY_FOLDER:-}"

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

case "$WINDOW_MIN" in '' | *[!0-9]*) echo "WINDOW_MIN must be a whole number" >&2; exit 2 ;; esac
case "$FIND_TIMEOUT" in '' | *[!0-9]*) echo "FIND_TIMEOUT must be a whole number" >&2; exit 2 ;; esac
read -r -a ROOTS <<<"$SEARCH_ROOTS"
[ "${#ROOTS[@]}" -gt 0 ] || ROOTS=(/)
for root in "${ROOTS[@]}"; do
  case "$root" in /*) ;; *) echo "SEARCH_ROOTS entries must be absolute paths: $root" >&2; exit 2 ;; esac
done
if [ -n "$SURVEY_FOLDER" ]; then
  case "$SURVEY_FOLDER" in /*) ;; *) echo "SURVEY_FOLDER must be an absolute path" >&2; exit 2 ;; esac
fi

LOW=(env) # never empty, so older bash with `set -u` is safe
have nice && LOW+=(nice -n 19)
have ionice && LOW+=(ionice -c 3)
# File descriptor 3 is the real output, so a warning raised inside a captured
# search still appears in the report.
exec 3>&1

# find <expression...>: search every root without crossing into virtual,
# temporary or network file systems. Prints results; flags a timeout.
search() {
  local status
  "${LOW[@]}" timeout "$FIND_TIMEOUT" find "${ROOTS[@]}" \
    \( -fstype proc -o -fstype sysfs -o -fstype devtmpfs -o -fstype devpts \
       -o -fstype cgroup -o -fstype cgroup2 \
       -o -fstype nfs -o -fstype nfs4 -o -fstype cifs -o -fstype fuse.sshfs \) -prune \
    -o "$@" 2>/dev/null
  status=$?
  if [ "$status" -eq 124 ]; then echo "SEARCH INCOMPLETE: timed out after ${FIND_TIMEOUT}s, so counts may be too low" >&3; fi
  return 0
}

section "When and who"
date -u '+%Y-%m-%d %H:%M UTC'
echo "user: $(id -un)  groups: $(id -Gn)"

section "System (operating system and kernel only)"
# Parsed, not sourced: nothing in the file is executed.
if [ -r /etc/os-release ]; then sed -nE 's/^PRETTY_NAME="?([^"]*)"?$/\1/p' /etc/os-release; fi
uname -sr
uptime
echo
df -h -x tmpfs -x devtmpfs 2>/dev/null
echo
free -h 2>/dev/null || true

section "Network (addresses and listening ports only)"
if have ip; then ip -br addr 2>/dev/null; else hostname -I 2>/dev/null; fi
echo
if have ss; then ss -tln 2>/dev/null | head -30; fi

section "Receiver hardware (DVB-S2 card or network receiver)"
ls -l /dev/dvb 2>/dev/null || echo "no /dev/dvb"
if have lsmod; then lsmod 2>/dev/null | grep -i -E 'dvb|tbs|novra|s300' || echo "no DVB kernel modules listed"; fi
if have lsusb; then lsusb 2>/dev/null | grep -i -E 'novra|tbs|dvb' || echo "no matching USB device"; fi

section "FAZZT / Kencast software"
if have systemctl; then
  units=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | grep -i -E 'fazzt|kencast|novra|dvb' | cut -c1-150)
  echo "${units:-no matching systemd service}"
fi
echo "running processes (user, pid, running time, program name only):"
ps -eo user,pid,etime,comm 2>/dev/null | grep -i -E 'fazzt|kencast' | grep -v grep || echo "none matching"
echo
echo "install folders (name match, 4 levels deep):"
search -maxdepth 4 \( -iname '*fazzt*' -o -iname '*kencast*' \) -print | head -20

section "Recent satellite and model files (last ${WINDOW_MIN} minutes)"
# One search, reused for the summaries below (the others run separately). Fields: folder, name, mtime.
RECENT=$(search -type f -mmin "-$WINDOW_MIN" \
  \( -name 'OR_ABI-L2-*' -o -name 'OR_GLM-*' -o -name '*.grib2' -o -name '*.grb2' -o -name '*.grb' \) \
  -printf '%h\t%f\t%T@\n')
count() { if [ -z "$RECENT" ]; then echo 0; else printf '%s\n' "$RECENT" | awk -F'\t' -v re="$1" '$2 ~ re' | wc -l; fi; }
echo "GOES ABI Level 2 (OR_ABI-L2-*):  $(count '^OR_ABI-L2-') files"
echo "GOES lightning (OR_GLM-*):       $(count '^OR_GLM-') files"
echo "GRIB model files:                $(count '\\.(grib2|grb2|grb)$') files"
echo
echo "folders holding recent GOES ABI files (count, folder):"
if [ -n "$RECENT" ]; then printf '%s\n' "$RECENT" | awk -F'\t' '$2 ~ /^OR_ABI-L2-/ {print $1}' | sort | uniq -c | sort -rn | head -10; fi
echo
echo "folders holding recent GRIB files (count, folder):"
if [ -n "$RECENT" ]; then printf '%s\n' "$RECENT" | awk -F'\t' '$2 ~ /\.(grib2|grb2|grb)$/ {print $1}' | sort | uniq -c | sort -rn | head -10; fi
echo
echo "GOES ABI products, bands and satellites in the window (count, product, band, satellite):"
if [ -n "$RECENT" ]; then
  printf '%s\n' "$RECENT" | awk -F'\t' '$2 ~ /^OR_ABI-L2-/ {print $2}' \
    | sed -E 's/^OR_ABI-L2-([A-Z0-9]+)-M[0-9](C[0-9]{2})?_G([0-9]{2}).*/\1 \2 G\3/' \
    | sort | uniq -c | sort -rn | head -30
fi

section "Newest 15 GOES ABI Level 2 files anywhere (arrival time, size, path)"
search -type f -name 'OR_ABI-L2-*' -printf '%T@ %TY-%Tm-%Td %TH:%TM  %10s  %p\n' \
  | sort -rn | head -15 | cut -d' ' -f2-

section "Does the file time match the scan time in its name? (newest 5)"
# FAZZT may set a file's time to when it arrived, or keep the source's time.
# The collector's stall check relies on arrival time, so this matters.
search -type f -name 'OR_ABI-L2-CMIPF-*' -printf '%T@ %f\n' | sort -rn | head -5 | while read -r mtime name; do
  stamp=$(printf '%s' "$name" | sed -nE 's/.*_s([0-9]{4})([0-9]{3})([0-9]{2})([0-9]{2})([0-9]{2}).*/\1 \2 \3:\4:\5/p')
  [ -n "$stamp" ] || continue
  set -- $stamp
  scan=$(date -u -d "$1-01-01 +$((10#$2 - 1)) days $3" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "?")
  arrived=$(date -u -d "@${mtime%.*}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "?")
  echo "scan $scan UTC   file time $arrived UTC   ($name)" | cut -c1-110
done

if [ -n "$SURVEY_FOLDER" ] && [ ! -d "$SURVEY_FOLDER" ]; then
  section "Folder detail: $SURVEY_FOLDER"
  echo "not a directory, or not readable by this user"
fi
if [ -n "$SURVEY_FOLDER" ] && [ -d "$SURVEY_FOLDER" ]; then
  section "Folder detail: $SURVEY_FOLDER"
  "${LOW[@]}" timeout "$FIND_TIMEOUT" du -sh "$SURVEY_FOLDER" 2>/dev/null
  echo "owner and permissions: $(stat -c '%U:%G %a' "$SURVEY_FOLDER" 2>/dev/null)"
  echo "oldest and newest file times:"
  "${LOW[@]}" timeout "$FIND_TIMEOUT" find "$SURVEY_FOLDER" -type f -printf '%TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | sort | sed -n '1p;$p'
  echo "file count: $("${LOW[@]}" timeout "$FIND_TIMEOUT" find "$SURVEY_FOLDER" -type f 2>/dev/null | wc -l)"
fi

section "Tools available for the collector"
for tool in python3 uv git curl systemctl; do
  if have "$tool"; then echo "$tool: $("$tool" --version 2>&1 | head -1)"; else echo "$tool: missing"; fi
done

section "Done"
echo "If any 'SEARCH INCOMPLETE' line appears above, that count may be too low:"
echo "narrow the search with SEARCH_ROOTS (for example SEARCH_ROOTS=\"/data\") or raise FIND_TIMEOUT."
echo "Keep this output private: it identifies the machine."
