#!/usr/bin/env python3
"""Pre-migration backup gate: is the newest nightly backup of every database fresh?

Reads the object keys the scheduled backup (backup-database.yml) writes to
production/YYYY/MM/DD/<database>_<YYYYMMDD_HHMMSS>.dump and reuses the discovery
logic of restore-drill.py (discover_daily). It never downloads a dump, never prints
credentials or the endpoint, and only needs list permission on the bucket.

Exit codes: 0 fresh (or nothing to check), 10 stale, 11 could not be verified.
Credentials come from BACKUP_GATE_* variables, not ambient AWS_* ones, so the
deploy step never carries the backup write key.
"""

import datetime
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys

FRESH, STALE, UNVERIFIED = 0, 10, 11
HERE = Path(__file__).resolve().parent


def load_drill():
    spec = importlib.util.spec_from_file_location(
        "restore_drill", HERE / "restore-drill.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def list_keys(now, max_age_hours):
    needed = {
        "BACKUP_GATE_BUCKET": "bucket name",
        "BACKUP_GATE_ENDPOINT": "endpoint",
        "BACKUP_GATE_ACCESS_KEY_ID": "access key id",
        "BACKUP_GATE_SECRET_ACCESS_KEY": "secret access key",
    }
    missing = [label for key, label in needed.items() if not os.environ.get(key)]
    if missing:
        raise LookupError(
            "backup store credentials not available to the deploy runner (missing: "
            + ", ".join(missing)
            + ")"
        )
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", "/tmp"),
        "AWS_ACCESS_KEY_ID": os.environ["BACKUP_GATE_ACCESS_KEY_ID"],
        "AWS_SECRET_ACCESS_KEY": os.environ["BACKUP_GATE_SECRET_ACCESS_KEY"],
        "AWS_DEFAULT_REGION": os.environ.get("BACKUP_GATE_REGION") or "us-east-1",
        "AWS_EC2_METADATA_DISABLED": "true",
    }
    keys = []
    for offset in range(math.ceil(max_age_hours / 24) + 2):
        day = (now - datetime.timedelta(days=offset)).strftime("%Y/%m/%d")
        try:
            result = subprocess.run(
                [
                    "aws",
                    "s3api",
                    "list-objects-v2",
                    "--bucket",
                    os.environ["BACKUP_GATE_BUCKET"],
                    "--prefix",
                    f"production/{day}/",
                    "--query",
                    "Contents[].Key",
                    "--output",
                    "json",
                    "--endpoint-url",
                    os.environ["BACKUP_GATE_ENDPOINT"],
                ],
                capture_output=True,
                text=True,
                check=True,
                env=env,
                timeout=45,
            )
        except FileNotFoundError:
            raise LookupError("the aws CLI is not installed on the runner") from None
        except subprocess.TimeoutExpired:
            raise LookupError("listing the backup bucket timed out") from None
        except subprocess.CalledProcessError as error:
            # stderr is deliberately not echoed: it can name the endpoint.
            raise LookupError(
                f"listing the backup bucket failed (aws exit {error.returncode})"
            ) from None
        try:
            keys += json.loads(result.stdout or "null") or []
        except ValueError:
            raise LookupError("the bucket listing was not valid JSON") from None
    return keys


def evaluate(max_age_hours, now, keys):
    """Return (status, lines). Pure, so tests need no bucket."""
    drill = load_drill()
    try:
        newest = drill.discover_daily(keys, now, max_age_hours=10**6)
    except ValueError:
        # The listing worked, but a required database has no dump in the window.
        listed = set()
        for key in keys:
            match = drill.DAILY_DUMP.fullmatch(key.rsplit("/", 1)[-1])
            if match:
                listed.add(match.group(1))
        return STALE, [
            f"{name}: no backup found in the last {max_age_hours:g}h window"
            for name in drill.DAILY_REQUIRED
            if name not in listed
        ]
    taken = {
        name: datetime.datetime.strptime(
            drill.DAILY_DUMP.fullmatch(key.rsplit("/", 1)[-1]).group(2),
            "%Y%m%d_%H%M%S",
        ).replace(tzinfo=datetime.UTC)
        for name, key in newest
    }
    lines, stale = [], False
    for name in drill.DAILY_REQUIRED:
        age = (now - taken[name]).total_seconds() / 3600
        too_old = age > max_age_hours
        stale = stale or too_old
        lines.append(
            f"{name}: newest backup {age:.1f}h old"
            + (f" (limit {max_age_hours:g}h)" if too_old else "")
        )
    return (STALE if stale else FRESH), lines


def main(argv):
    environment = argv[1] if len(argv) > 1 else ""
    if environment not in {"staging", "production"}:
        print("Invalid environment")
        return UNVERIFIED
    try:
        max_age_hours = float(os.environ.get("DEPLOY_BACKUP_MAX_AGE_HOURS") or 26)
        if not 0 < max_age_hours < 24 * 30:
            raise ValueError
    except ValueError:
        print("DEPLOY_BACKUP_MAX_AGE_HOURS must be a positive number of hours")
        return UNVERIFIED
    if environment != "production":
        print(
            "staging: not checked, the scheduled backup covers production only "
            "(no staging backup exists to compare against)"
        )
        return FRESH
    now = datetime.datetime.now(datetime.UTC)
    try:
        keys = list_keys(now, max_age_hours)
    except LookupError as error:
        print(str(error))
        return UNVERIFIED
    status, lines = evaluate(max_age_hours, now, keys)
    print("\n".join(lines))
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv))
