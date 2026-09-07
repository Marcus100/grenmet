#!/usr/bin/env python3
"""Check each required off-host store independently of its backup host."""
import datetime
import json
import os
import subprocess
import sys

WEATHER_STORES = {"surface-files", "wis2box-config", "wis2box-auth", "mosquitto-config", "grafana", "prometheus", "loki", "surface-postgres", "elasticsearch", "minio"}


def check_marker(marker, environment, kind, now):
    completed = datetime.datetime.fromisoformat(marker.get("snapshot_at", marker["completed_at"]))
    if completed.tzinfo is None:
        raise ValueError("Backup timestamp must include a timezone")
    age = now - completed
    if marker["environment"] != environment or age.total_seconds() < 0 or age > datetime.timedelta(hours=24):
        raise ValueError("Backup is invalid or older than 24 hours")
    if kind == "core":
        names = [item["database"] for item in marker["databases"]]
        if len(names) != 6 or len(set(names)) != 6 or "app_test" in names or marker.get("absent_before_provisioning"):
            raise ValueError("Core database coverage is incomplete")
    elif kind == "weather":
        if set(marker["stores"]) != WEATHER_STORES or not marker["artifacts"]:
            raise ValueError("Weather coverage is incomplete")
    elif kind in {"objects", "sutron"}:
        if marker["kind"] != kind or not isinstance(marker["artifacts"], list):
            raise ValueError("File backup marker is invalid")
        if kind == "sutron" and (not marker["tables"] or len(marker["artifacts"]) != 2):
            raise ValueError("Sutron archive coverage is incomplete")
        if kind == "objects" and not isinstance(marker["objects"], dict):
            raise ValueError("Object inventory is missing")
    else:
        raise ValueError("Unknown backup kind")


def main():
    environment = sys.argv[1]
    kinds = sys.argv[2:] or ["core"]
    if environment not in {"staging", "production"} or set(kinds) - {"core", "weather", "objects", "sutron"}:
        raise ValueError("Invalid environment or backup kind")
    for kind in kinds:
        result = subprocess.run(["aws", "s3", "cp", f"s3://{os.environ['DO_SPACES_BUCKET']}/{environment}/{kind}/latest-success.json", "-", "--endpoint-url", os.environ["DO_SPACES_ENDPOINT"], "--only-show-errors"], capture_output=True, text=True, check=True)
        check_marker(json.loads(result.stdout), environment, kind, datetime.datetime.now(datetime.timezone.utc))
        print(f"{environment}: complete {kind} backup is within 24 hours")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, IndexError, TypeError, ValueError, OSError, subprocess.CalledProcessError):
        print("Backup freshness check failed; inspect the corresponding off-host completion marker", file=sys.stderr)
        sys.exit(1)
