#!/usr/bin/env python3
"""Quiesced weather backup: PostgreSQL dumps, Elasticsearch snapshots, S3 objects."""
import argparse
from contextlib import nullcontext
import datetime
import fcntl
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from uuid import uuid4


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inspect(container):
    return json.loads(run(["docker", "inspect", container], capture_output=True, text=True).stdout)[0]


def es_request(container, method, path, data=None):
    args = ["docker", "exec", container, "curl", "--fail", "--silent", "--show-error", "--max-time", "900", "-X", method, "-H", "Content-Type: application/json"]
    if data is not None:
        args += ["--data", json.dumps(data)]
    return json.loads(run(args + ["http://127.0.0.1:9200" + path], capture_output=True, text=True).stdout)


def backup(config, lock_held=False):
    environment = config["environment"]
    if environment not in {"staging", "production"}:
        raise ValueError("Invalid environment")
    bucket, endpoint = os.environ["DO_SPACES_BUCKET"], os.environ["DO_SPACES_ENDPOINT"]
    prefix = f"{environment}/weather/"
    lifecycle = json.loads(run(["aws", "s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket, "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
    if not any(rule.get("Status") == "Enabled" and rule.get("Expiration", {}).get("Days") == 30 and set(rule.get("Filter", {})) <= {"Prefix"} and prefix.startswith(rule.get("Filter", {}).get("Prefix", rule.get("Prefix", ""))) for rule in lifecycle.get("Rules", [])):
        raise ValueError("Weather backup requires 30-day off-host retention")
    batch = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    def container_for(project, service):
        identifiers = run(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={project}", "--filter", f"label=com.docker.compose.service={service}"], capture_output=True, text=True).stdout.split()
        if len(identifiers) != 1:
            raise ValueError("Exactly one running authoritative service is required")
        return identifiers[0]
    es = container_for(config["wis2box_project"], "elasticsearch")
    surface = container_for(config["surface_project"], "postgres")
    for container, project, service in [(es, config["wis2box_project"], "elasticsearch"), (surface, config["surface_project"], "postgres")]:
        info = inspect(container)
        labels = info["Config"]["Labels"]
        if not info["State"]["Running"] or labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != service:
            raise ValueError("Backup container does not match reviewed project/service")
    helper = config["archive_image"]
    if not re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", helper):
        raise ValueError("Archive helper image must be immutable and provide tar")
    required = {"surface-files", "wis2box-config", "wis2box-auth", "mosquitto-config", "grafana", "prometheus", "loki"}
    archives = config["archives"]
    if set(archives) != required:
        raise ValueError("Weather file/state archive inventory is incomplete")
    # Validate all configured archive sources before stopping any services.
    for archive in archives.values():
        if archive["type"] == "volume":
            run(["docker", "volume", "inspect", archive["source"]], stdout=subprocess.DEVNULL)
        elif archive["type"] == "bind":
            if not Path(archive["source"]).is_absolute() or not Path(archive["source"]).is_dir():
                raise ValueError("Missing required archive directory")
        else:
            raise ValueError("Unsupported archive source")
        if "," in archive["source"]:
            raise ValueError("Invalid archive source")
    # Caller shares the same inherited lock only when deploying from weather.py.
    lock = nullcontext() if lock_held else open("/var/lock/grenmet/weather.lock", "a")
    with lock as handle:
        if handle is not None:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        running = []
        for project in [config["wis2box_project"], config["surface_project"]]:
            ids = run(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={project}"], capture_output=True, text=True).stdout.split()
            for identifier in ids:
                item = inspect(identifier)
                if item["Config"]["Labels"].get("com.docker.compose.service") not in {"elasticsearch", "minio", "postgres", "redis", "cache"}:
                    running.append(identifier)
        with tempfile.TemporaryDirectory(prefix="grenmet-weather-backup-") as directory:
            root = Path(directory)
            repository = "grenmet-" + batch.lower()
            registered = False
            try:
                if running:
                    run(["docker", "stop", "--time", "60"] + running)
                with (root / "surface.dump").open("wb") as output:
                    run(["docker", "exec", surface, "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom'], stdout=output)
                with (root / "surface.dump").open("rb") as source:
                    run(["docker", "exec", "-i", surface, "pg_restore", "--list"], stdin=source, stdout=subprocess.DEVNULL)
                es_request(es, "PUT", f"/_snapshot/{repository}", {"type": "fs", "settings": {"location": f"/snapshots/{repository}"}})
                registered = True
                snapshot = es_request(es, "PUT", f"/_snapshot/{repository}/complete?wait_for_completion=true", {"include_global_state": True})
                if snapshot.get("snapshot", {}).get("state") != "SUCCESS":
                    raise ValueError("Elasticsearch snapshot incomplete")
                es_request(es, "PUT", f"/_snapshot/{repository}", {"type": "fs", "settings": {"location": f"/snapshots/{repository}", "readonly": True}})
                run(["docker", "cp", f"{es}:/snapshots/{repository}", str(root / "elasticsearch")])
                minio_env = dict(os.environ, AWS_ACCESS_KEY_ID=os.environ["MINIO_BACKUP_ACCESS_KEY_ID"], AWS_SECRET_ACCESS_KEY=os.environ["MINIO_BACKUP_SECRET_ACCESS_KEY"])
                minio_endpoint = config["minio_endpoint"]
                buckets = json.loads(run(["aws", "s3api", "list-buckets", "--endpoint-url", minio_endpoint], env=minio_env, capture_output=True, text=True).stdout)["Buckets"]
                if not buckets:
                    raise ValueError("MinIO contains no configured buckets; review initialization")
                for item in buckets:
                    name = item["Name"]
                    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", name):
                        raise ValueError("Invalid bucket name")
                    run(["aws", "s3", "sync", f"s3://{name}", str(root / "minio" / name), "--endpoint-url", minio_endpoint, "--only-show-errors"], env=minio_env)
                (root / "minio-buckets.json").write_text(json.dumps(buckets))
                for name, archive in archives.items():
                    mount = f"type={archive['type']},source={archive['source']},target=/source,readonly"
                    args = ["docker", "run", "--rm", "--network=none", "--mount", mount, "--entrypoint", "tar", helper, "-czf", "-", "-C", "/source"]
                    # Only reviewed relative subdirectories; never archive SURFACE's live PG tree.
                    includes = archive["include"]
                    if not includes or not all(re.fullmatch(r"[a-zA-Z0-9_.-]+", part) and part not in {"..", "postgresql", "pgdata"} for part in includes):
                        raise ValueError("Invalid archive inclusion list")
                    if name == "surface-files" and "." in includes:
                        raise ValueError("SURFACE archive must explicitly exclude its database directory")
                    with (root / f"{name}.tar.gz").open("wb") as output:
                        run(args + includes, stdout=output)
            finally:
                try:
                    if registered:
                        es_request(es, "DELETE", f"/_snapshot/{repository}")
                        # This directory was created by this run only, after snapshot completion.
                        run(["docker", "exec", es, "rm", "-rf", "--", f"/snapshots/{repository}"])
                finally:
                    if running:
                        run(["docker", "start"] + running)
            # Upload only after source services have been resumed successfully.
            manifest = {"environment": environment, "stores": sorted(required | {"surface-postgres", "elasticsearch", "minio"}), "batch": batch, "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            run(["aws", "s3", "sync", str(root), f"s3://{bucket}/{prefix}{batch}/", "--endpoint-url", endpoint, "--only-show-errors"])
            manifest["artifacts"] = []
            for artifact in root.rglob("*"):
                if artifact.is_file():
                    key = f"{prefix}{batch}/{artifact.relative_to(root).as_posix()}"
                    head = json.loads(run(["aws", "s3api", "head-object", "--bucket", bucket, "--key", key, "--endpoint-url", endpoint], capture_output=True, text=True).stdout)
                    if head["ContentLength"] != artifact.stat().st_size:
                        raise ValueError("Off-host archive size verification failed")
                    with artifact.open("rb") as source:
                        digest = hashlib.file_digest(source, "sha256").hexdigest()
                    manifest["artifacts"].append({"key": key, "bytes": artifact.stat().st_size, "sha256": digest})
            manifest["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            marker = root / "success.json"
            marker.write_text(json.dumps(manifest))
            for key in [f"{prefix}{batch}/success.json", f"{prefix}latest-success.json"]:
                run(["aws", "s3", "cp", str(marker), f"s3://{bucket}/{key}", "--endpoint-url", endpoint, "--only-show-errors"])
            print("Weather backup completed off-host; isolated restore verification remains required")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("--lock-held", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        backup(json.loads(Path(args.config).read_text()), args.lock_held)
    except (KeyError, ValueError, OSError, subprocess.SubprocessError):
        print("Weather backup failed; no new complete backup marker recorded", file=sys.stderr)
        sys.exit(1)
