#!/usr/bin/env python3
"""Daily and pre-deployment core backup. Never restores into an application host."""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import uuid4


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def select_databases(names, actual, cms_name, before_provisioning=False, bootstrap_cms=False, has_complete_backup=False):
    missing = set(names) - set(actual)
    if missing and (not before_provisioning or not bootstrap_cms or has_complete_backup or missing != {cms_name}):
        raise ValueError("An authoritative core database is missing")
    return [name for name in names if name in actual], sorted(missing)


def backup(environment, project, config_path, before_provisioning=False):
    if environment not in {"staging", "production"}:
        raise ValueError("Expected staging or production")
    config = dict(line.split("=", 1) for line in Path(config_path).read_text().splitlines() if line and not line.startswith("#"))
    names = [config[key] for key in ["POSTGRES_DB", "WXWATCH_DB_NAME", "WXPRODUCTS_DB_NAME", "JANITORIAL_DB_NAME", "TRANSPORT_DB_NAME", "CMS_DB_NAME"]]
    if len(set(names)) != len(names) or any(not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", name) or name == "app_test" for name in names):
        raise ValueError("Backup database inventory is invalid")
    bucket = os.environ["DO_SPACES_BUCKET"]
    endpoint = os.environ["DO_SPACES_ENDPOINT"]
    lifecycle = json.loads(run(["aws", "s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket, "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
    prefix = f"{environment}/core/"
    rules = lifecycle.get("Rules", [])
    if not any(rule.get("Status") == "Enabled" and rule.get("Expiration", {}).get("Days") == 30 and "Tag" not in rule.get("Filter", {}) and "And" not in rule.get("Filter", {}) and prefix.startswith(rule.get("Filter", {}).get("Prefix", rule.get("Prefix", ""))) for rule in rules):
        raise ValueError("Backup bucket requires an enabled 30-day expiration rule for the core prefix")
    # The same environment-scoped credentials are used by daily and required pre-deploy jobs.
    for key in ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"]:
        if not os.environ.get(key):
            raise ValueError(f"{key} is required")
    containers = run(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={project}", "--filter", "label=com.docker.compose.service=db"], capture_output=True, text=True).stdout.split()
    if len(containers) != 1:
        raise ValueError("Exactly one running core database container is required")
    actual = run(["docker", "exec", containers[0], "sh", "-c", 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate"'], capture_output=True, text=True).stdout.splitlines()
    # Listing failures are fatal: absence must never be inferred from access errors.
    previous = json.loads(run(["aws", "s3api", "list-objects-v2", "--bucket", bucket, "--prefix", f"{environment}/core/latest-success.json", "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
    has_complete_backup = any(item["Key"] == f"{environment}/core/latest-success.json" for item in previous.get("Contents", []))
    names, missing = select_databases(names, actual, config["CMS_DB_NAME"], before_provisioning, os.environ.get("BOOTSTRAP_CMS") == "true", has_complete_backup)
    now = datetime.datetime.now(datetime.timezone.utc)
    batch = now.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    directory = Path(os.environ.get("BACKUP_DIR", "/var/backups/grenmet")) / environment / batch
    directory.mkdir(mode=0o700, parents=True)
    prefix = f"{environment}/core/{batch}"
    manifest = {"environment": environment, "completed_at": now.isoformat(), "databases": [], "absent_before_provisioning": missing}
    for name in names:
        destination = directory / f"{name}.dump"
        with destination.open("xb") as output:
            run(["docker", "exec", containers[0], "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom', "sh", name], stdout=output)
        destination.chmod(0o600)
        if not destination.stat().st_size:
            raise ValueError("Empty database dump")
        # TOC check catches corrupt/truncated headers; the isolated drill checks restoration.
        with destination.open("rb") as source:
            run(["docker", "exec", "-i", containers[0], "pg_restore", "--list"], stdin=source, stdout=subprocess.DEVNULL)
        key = f"{prefix}/{destination.name}"
        run(["aws", "s3", "cp", str(destination), f"s3://{bucket}/{key}", "--endpoint-url", endpoint, "--only-show-errors"])
        run(["aws", "s3api", "head-object", "--bucket", bucket, "--key", key, "--endpoint-url", endpoint], stdout=subprocess.DEVNULL)
        manifest["databases"].append({"database": name, "key": key, "bytes": destination.stat().st_size})
        print(f"{name}: verified off-host upload")
    # Upload a completion marker only after every authoritative database succeeds.
    manifest["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    marker = directory / "success.json"
    marker.write_text(json.dumps(manifest, indent=2) + "\n")
    run(["aws", "s3", "cp", str(marker), f"s3://{bucket}/{prefix}/success.json", "--endpoint-url", endpoint, "--only-show-errors"])
    # A bootstrap backup is valid for the existing five stores, but cannot
    # replace the daily six-store success marker used by freshness monitoring.
    if not missing:
        run(["aws", "s3", "cp", str(marker), f"s3://{bucket}/{environment}/core/latest-success.json", "--endpoint-url", endpoint, "--only-show-errors"])
    if before_provisioning and os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"cms_missing={'true' if missing else 'false'}\n")
    cutoff = now.timestamp() - 30 * 24 * 60 * 60
    for previous in directory.parent.iterdir():
        if previous.is_dir() and not previous.is_symlink() and re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}", previous.name) and previous.stat().st_mtime < cutoff:
            shutil.rmtree(previous)
    print("Core backup complete; isolated restore drill is a separate acceptance gate")


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("environment", choices=["staging", "production"])
        parser.add_argument("project")
        parser.add_argument("config_path")
        parser.add_argument("--before-provisioning", action="store_true")
        args = parser.parse_args()
        backup(args.environment, args.project, args.config_path, args.before_provisioning)
    except (KeyError, ValueError, OSError, subprocess.CalledProcessError):
        print("Core backup failed; no complete backup was recorded. Check database configuration and Spaces access.", file=sys.stderr)
        sys.exit(1)
