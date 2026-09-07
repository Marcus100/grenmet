#!/usr/bin/env python3
"""Off-host object snapshots and SQLite API backups; no live database-file copying."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from uuid import uuid4


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def versions_at(listing, cutoff):
    selected = {}
    for deleted, entries in [(False, listing.get("Versions", [])), (True, listing.get("DeleteMarkers", []))]:
        for entry in entries:
            timestamp = datetime.datetime.fromisoformat(entry["LastModified"].replace("Z", "+00:00"))
            if timestamp <= cutoff and (entry["Key"] not in selected or timestamp > selected[entry["Key"]][0]):
                selected[entry["Key"]] = (timestamp, entry["VersionId"], deleted)
    return {key: {"version": value[1], "deleted": value[2]} for key, value in sorted(selected.items())}


def sqlite_copy(source, destination):
    source = Path(source).resolve(strict=True)
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as connection, sqlite3.connect(destination) as copy:
        connection.backup(copy)
        if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite backup integrity check failed")
        return [row[0] for row in copy.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]


def backup(config):
    environment, kind = config["environment"], config["kind"]
    if environment not in {"staging", "production"} or kind not in {"objects", "sutron"}:
        raise ValueError("Invalid backup environment/kind")
    if os.environ.get("DEPLOY_ENV") and environment != os.environ["DEPLOY_ENV"]:
        raise ValueError("Backup environment does not match the release target")
    endpoint, bucket = os.environ["DO_SPACES_ENDPOINT"], os.environ["DO_SPACES_BUCKET"]
    prefix = f"{environment}/{kind}/"
    lifecycle = json.loads(run(["aws", "s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket, "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
    if not any(rule.get("Status") == "Enabled" and rule.get("Expiration", {}).get("Days") == 30 and set(rule.get("Filter", {})) <= {"Prefix"} and prefix.startswith(rule.get("Filter", {}).get("Prefix", rule.get("Prefix", ""))) for rule in lifecycle.get("Rules", [])):
        raise ValueError("Backup destination requires 30-day retention")
    cutoff = datetime.datetime.now(datetime.timezone.utc)
    prefix += cutoff.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8] + "/"
    manifest = {"environment": environment, "kind": kind, "snapshot_at": cutoff.isoformat(), "artifacts": []}

    def upload(path, key):
        run(["aws", "s3", "cp", str(path), f"s3://{bucket}/{key}", "--endpoint-url", endpoint, "--only-show-errors"])
        head = json.loads(run(["aws", "s3api", "head-object", "--bucket", bucket, "--key", key, "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
        if head["ContentLength"] != path.stat().st_size:
            raise ValueError("Off-host size verification failed")
        with path.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        return {"key": key, "bytes": path.stat().st_size, "sha256": digest}

    with tempfile.TemporaryDirectory(prefix="grenmet-file-backup-") as directory:
        root = Path(directory)
        if kind == "sutron":
            snapshot = root / "archive.sqlite"
            manifest["tables"] = sqlite_copy(config["sqlite"], snapshot)
            manifest["artifacts"].append(upload(snapshot, prefix + snapshot.name))
            files = Path(config["handoff_directory"]).resolve(strict=True)
            if not files.is_dir():
                raise ValueError("Missing Sutron handoff directory")
            archive = root / "handoff.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                for file in sorted(files.iterdir()):
                    if file.is_file() and not file.is_symlink() and file.suffix in {".csv", ".asc"}:
                        target.add(file, arcname=file.name, recursive=False)
            manifest["artifacts"].append(upload(archive, prefix + archive.name))
        else:
            source_bucket, source_endpoint = config["source_bucket"], config["source_endpoint"]
            if os.environ.get("STORAGE_BUCKET") and source_bucket != os.environ["STORAGE_BUCKET"]:
                raise ValueError("Object source bucket differs from application configuration")
            if os.environ.get("STORAGE_ENDPOINT_URL") and source_endpoint.rstrip("/") != os.environ["STORAGE_ENDPOINT_URL"].rstrip("/"):
                raise ValueError("Object source endpoint differs from application configuration")
            if source_bucket == bucket:
                raise ValueError("Object backup must use a separate bucket")
            credentials = dict(os.environ, AWS_ACCESS_KEY_ID=os.environ["STORAGE_ACCESS_KEY_ID"], AWS_SECRET_ACCESS_KEY=os.environ["STORAGE_SECRET_ACCESS_KEY"])
            def source_api(*args):
                return json.loads(run(["aws", "s3api", *args, "--bucket", source_bucket, "--endpoint-url", source_endpoint], capture_output=True, text=True, env=credentials).stdout)
            if source_api("get-bucket-versioning").get("Status") != "Enabled":
                raise ValueError("Source bucket versioning is required for consistent object backups")
            selected = versions_at(source_api("list-object-versions"), cutoff)
            manifest["objects"] = selected
            for index, (key, version) in enumerate(selected.items()):
                if version["deleted"]:
                    continue
                destination = root / "object"
                run(["aws", "s3api", "get-object", "--bucket", source_bucket, "--key", key, "--version-id", version["version"], "--endpoint-url", source_endpoint, str(destination)], env=credentials, stdout=subprocess.DEVNULL)
                artifact = upload(destination, prefix + f"objects/{index}")
                artifact["original_key"] = key
                manifest["artifacts"].append(artifact)
            if selected != versions_at(source_api("list-object-versions"), cutoff):
                raise ValueError("Source version history changed during backup; retry required")
        manifest["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        marker = root / "success.json"
        marker.write_text(json.dumps(manifest))
        upload(marker, prefix + "success.json")
        upload(marker, f"{environment}/{kind}/latest-success.json")
        print(f"{kind}: verified off-host backup completed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    args = parser.parse_args()
    try:
        backup(json.loads(Path(args.config).read_text()))
    except (KeyError, ValueError, OSError, sqlite3.Error, subprocess.SubprocessError):
        print("File backup failed; no new verified completion marker recorded", file=sys.stderr)
        sys.exit(1)
