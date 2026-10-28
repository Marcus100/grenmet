#!/usr/bin/env bash
# Read-only survey of a GeoNetCast Americas receiver PC.
#
# Run it on the receiver and keep the output for the owner. It changes nothing,
# reads no file contents, and prints no environment variables, configuration
# files or credentials. It does print the hostname and IP addresses, so keep the
# output in /private/ or the owner's notes, never in this public repository.
#
#   bash survey-receiver.sh > survey-$(date +%F).txt 2>&1
#
# Optional: SURVEY_FOLDER=/path/to/fazzt/output lists that folder in detail.
set -u

WINDOW_MIN="${WINDOW_MIN:-120}"   # "recent" file window in minutes
SEARCH_ROOTS="${SEARCH_ROOTS:-/}" # narrow this if the search is slow

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
quiet_find() { timeout 120 find "$@" 2>/dev/null; }

section "When and who"
date -u '+%Y-%m-%d %H:%M UTC'
echo "user: $(id -un)  groups: $(id -Gn)"

section "System"
if have hostnamectl; then hostnamectl 2>/dev/null; else uname -a; fi
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
if have lsusb; then lsusb 2>/dev/null | grep -i -E 'novra|tbs|dvb|tv|sat' || echo "no matching USB device"; fi

section "FAZZT / Kencast software"
if have systemctl; then
  systemctl list-units --type=service --all 2>/dev/null | grep -i -E 'fazzt|kencast|novra|dvb' || echo "no matching systemd service"
fi
ps -eo user,pid,etime,args 2>/dev/null | grep -i -E 'fazzt|kencast' | grep -v grep | cut -c1-200 || true
echo
echo "install folders (name match, 4 levels deep):"
quiet_find / -xdev -maxdepth 4 \( -iname '*fazzt*' -o -iname '*kencast*' \) -not -path '/proc/*' | head -20

section "Recent satellite and model files (last ${WINDOW_MIN} minutes)"
for pattern in 'OR_ABI-L2-CMIP*' 'OR_ABI-L2-*' 'OR_GLM-*' '*.grib2' '*.grb2' '*.grb' '*.nc'; do
  count=$(quiet_find $SEARCH_ROOTS -xdev -type f -name "$pattern" -mmin "-$WINDOW_MIN" \
    -not -path '/proc/*' -not -path '/sys/*' -not -path '*/node_modules/*' -not -path '*/.cache/*' | wc -l)
  echo "$pattern: $count files"
done
echo
echo "folders holding recent GOES ABI files (count, folder):"
quiet_find $SEARCH_ROOTS -xdev -type f -name 'OR_ABI-L2-*' -mmin "-$WINDOW_MIN" \
  -not -path '/proc/*' -not -path '/sys/*' -printf '%h\n' | sort | uniq -c | sort -rn | head -10
echo
echo "folders holding recent GRIB model files (count, folder):"
quiet_find $SEARCH_ROOTS -xdev -type f \( -name '*.grib2' -o -name '*.grb2' -o -name '*.grb' \) -mmin "-$WINDOW_MIN" \
  -not -path '/proc/*' -not -path '/sys/*' -printf '%h\n' | sort | uniq -c | sort -rn | head -10

section "Newest 15 GOES ABI Level 2 files anywhere"
quiet_find $SEARCH_ROOTS -xdev -type f -name 'OR_ABI-L2-*' -not -path '/proc/*' -not -path '/sys/*' \
  -printf '%TY-%Tm-%Td %TH:%TM  %10s  %p\n' | sort -r | head -15

section "GOES products and bands received (from file names in the window)"
quiet_find $SEARCH_ROOTS -xdev -type f -name 'OR_ABI-L2-*' -mmin "-$WINDOW_MIN" \
  -not -path '/proc/*' -not -path '/sys/*' -printf '%f\n' \
  | sed -E 's/^OR_ABI-L2-([A-Z]+[A-Z0-9]*)-M[0-9](C[0-9]{2})?_G([0-9]{2}).*/\1 \2 G\3/' \
  | sort | uniq -c | sort -rn | head -30

if [ -n "${SURVEY_FOLDER:-}" ] && [ -d "$SURVEY_FOLDER" ]; then
  section "Folder detail: $SURVEY_FOLDER"
  du -sh "$SURVEY_FOLDER" 2>/dev/null
  echo "owner and permissions: $(stat -c '%U:%G %a' "$SURVEY_FOLDER" 2>/dev/null)"
  echo "oldest and newest file times:"
  quiet_find "$SURVEY_FOLDER" -type f -printf '%TY-%Tm-%Td %TH:%TM\n' | sort | sed -n '1p;$p'
  echo "file count: $(quiet_find "$SURVEY_FOLDER" -type f | wc -l)"
fi

section "Tools available for the collector"
for tool in python3 uv git curl systemctl; do
  if have "$tool"; then echo "$tool: $("$tool" --version 2>&1 | head -1)"; else echo "$tool: missing"; fi
done

section "Done"
echo "Keep this output private: it contains the hostname and IP addresses."
