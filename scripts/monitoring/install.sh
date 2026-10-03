#!/usr/bin/env bash
# Invoked only by trusted deployment jobs. Does not grant runner privileges.
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Monitoring installation requires existing administrator privileges'; exit 1; }
: "${DEPLOY_ENV:?}" "${GITHUB_SHA:?}" "${PROBE_HEARTBEAT_URL:?}"
[[ "$DEPLOY_ENV" == staging || "$DEPLOY_ENV" == production ]] || exit 2
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$PROBE_HEARTBEAT_URL" =~ ^https://(incidents|uptime)\.betterstack\.com/api/v1/heartbeat/[a-zA-Z0-9]+$ ]] || exit 2
if [[ "${PROBE_INCIDENTS_ENABLED:-false}" == true ]]; then
  : "${BETTERSTACK_API_TOKEN:?Configure the incident API token}"
fi
root=$(cd "$(dirname "$0")/../.." && pwd)
getent passwd deploy >/dev/null
release="/opt/grenmet/monitoring-releases/$GITHUB_SHA"
install -d -m 0755 "$release/scripts/monitoring" "$release/packages/ui/src/lib"
install -d -m 0700 /etc/grenmet
install -d -o deploy -g deploy -m 0700 /var/lib/grenmet-monitoring
install -m 0644 "$root"/scripts/monitoring/*.py "$release/scripts/monitoring/"
install -m 0644 "$root/packages/ui/src/lib/service-catalogue.json" "$release/packages/ui/src/lib/service-catalogue.json"
previous=$(readlink /opt/grenmet/monitoring-current || true)
snapshot=$(mktemp -d /etc/grenmet/monitoring-rollback.XXXXXX)
for file in /etc/grenmet/monitoring.conf /etc/systemd/system/probes.service /etc/systemd/system/probes.timer; do
  if [[ -f "$file" ]]; then cp "$file" "$snapshot/$(basename "$file")"; fi
done
was_enabled=false
if systemctl is-enabled --quiet probes.timer; then was_enabled=true; fi
rollback() {
  if [[ -n "$previous" ]]; then ln -sfn "$previous" /opt/grenmet/monitoring-current; fi
  for file in /etc/grenmet/monitoring.conf /etc/systemd/system/probes.service /etc/systemd/system/probes.timer; do
    if [[ -f "$snapshot/$(basename "$file")" ]]; then cp "$snapshot/$(basename "$file")" "$file"; else rm -f "$file"; fi
  done
  systemctl daemon-reload
  if [[ "$was_enabled" == true ]]; then systemctl enable --now probes.timer; fi
  echo 'Monitoring acceptance failed; previous configuration restored' >&2
}
trap rollback ERR
systemctl stop probes.timer || true
# Wait for any in-flight oneshot before switching code and configuration.
systemctl stop probes.service || true
ln -sfn "$release" /opt/grenmet/monitoring-current
umask 077
printf 'MONITORING_ENVIRONMENT=%s\nPROBE_HEARTBEAT_URL=%s\n' "$DEPLOY_ENV" "$PROBE_HEARTBEAT_URL" > /etc/grenmet/monitoring.conf
sed 's|/opt/grenmet/|/opt/grenmet/monitoring-current/|g; s|WorkingDirectory=/opt/grenmet$|WorkingDirectory=/opt/grenmet/monitoring-current|' "$root/scripts/monitoring/probes.service" > /etc/systemd/system/probes.service
chmod 0644 /etc/systemd/system/probes.service
python3 - <<'CONFIG'
import json
import os
from datetime import datetime, timedelta
windows = json.loads(os.environ.get('PROBE_MAINTENANCE') or '{}')
for app, window in windows.items():
    start, end = datetime.fromisoformat(window['start']), datetime.fromisoformat(window['end'])
    if not start.tzinfo or not end.tzinfo or not timedelta(0) < end - start <= timedelta(hours=48):
        raise ValueError('Maintenance must be timezone-aware and at most 48 hours')
with open('/etc/grenmet/monitoring.conf', 'a') as output:
    for key in ('BETTERSTACK_API_TOKEN', 'PROBE_INCIDENTS_ENABLED'):
        value = os.environ.get(key, '')
        if any(char in value for char in '\n\r\x00'):
            raise ValueError('Invalid configuration value')
        output.write(key + '=' + json.dumps(value) + '\n')
    output.write('PROBE_MAINTENANCE=' + json.dumps(json.dumps(windows)) + '\n')
CONFIG
install -m 0644 "$root/scripts/monitoring/probes.timer" /etc/systemd/system/probes.timer
systemctl daemon-reload
systemctl start probes.service
systemctl enable --now probes.timer
printf '%s\n' "$GITHUB_SHA" > /opt/grenmet/monitoring-revision
chmod 0644 /opt/grenmet/monitoring-revision
trap - ERR
# Keep the immediately preceding rollback snapshot; remove older credential copies.
for old in /etc/grenmet/monitoring-rollback.*; do
  if [[ "$old" != "$snapshot" && -d "$old" ]]; then rm -rf -- "$old"; fi
done
