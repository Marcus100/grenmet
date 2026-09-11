#!/usr/bin/env python3
"""Launch one configured, bounded collector; never execute configuration as shell."""
import argparse
import fcntl
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from uuid import uuid4

SOURCES = {"goes19", "sfcana", "cimss", "trackthetropics", "uwyo"}


def command(name, spec):
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,40}", name):
        raise ValueError("Invalid collector name")
    if spec.get("enabled") is not True:
        raise ValueError("Collector integration is unconfigured or disabled")
    image = spec.get("image", "")
    if not re.fullmatch(r"ghcr\.io/[a-z0-9/_.-]+@sha256:[0-9a-f]{64}", image):
        raise ValueError("Collector requires an immutable GHCR image")
    env_file = Path(spec["env_file"])
    if not env_file.is_absolute() or env_file.name != ".env.local" or not env_file.is_file():
        raise ValueError("Collector requires an existing absolute .env.local path")
    if env_file.stat().st_mode & 0o077:
        raise ValueError("Collector configuration must be private (mode 600)")
    kind = spec["kind"]
    args = spec.get("args", [])
    if not isinstance(args, list) or not all(isinstance(value, str) for value in args):
        raise ValueError("Collector arguments must be a string array")
    if kind == "wxwatch":
        if args not in [[source] for source in SOURCES]:
            raise ValueError("Schedule exactly one supported wxwatch source")
        values = dict(line.split("=", 1) for line in env_file.read_text().splitlines() if line and not line.startswith("#") and "=" in line)
        for key in ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "STORAGE_ENDPOINT_URL", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"]:
            if not values.get(key):
                raise ValueError(f"Collector requires {key}")
        import ipaddress
        address = ipaddress.ip_address(values["DB_HOST"])
        if not any(address in ipaddress.ip_network(network) for network in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]):
            raise ValueError("wxwatch must connect to the private core address")
    elif kind == "gms-ingest":
        if args != ["collect", "--output-dir", "/data/nhc"]:
            raise ValueError("GMS ingestion must write to the mounted /data/nhc output")
    else:
        raise ValueError("Unsupported collector kind")
    result = ["docker", "run", "--rm", "--init", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--env-file", str(env_file), "--label", "grenmet.collector=true"]
    mounts = spec.get("mounts", [])
    if kind == "gms-ingest" and not mounts:
        raise ValueError("Collector input/output mounts are required")
    if kind == "gms-ingest" and not any(m.get("target") == "/data/nhc" and m.get("readonly") is False for m in mounts):
        raise ValueError("GMS ingestion requires writable /data/nhc")
    for mount in mounts:
        source = Path(mount["source"])
        target = mount["target"]
        if not source.is_absolute() or not source.is_dir() or "," in str(source):
            raise ValueError("Collector source directory must already exist")
        if not isinstance(target, str) or not target.startswith("/data/") or "," in target or ".." in Path(target).parts:
            raise ValueError("Collector mount must be inside /data")
        mode = ",readonly" if mount.get("readonly", True) else ""
        result += ["--mount", f"type=bind,source={source},target={target}{mode}"]
    return result, image, args


def run(name, spec, lock_dir):
    prefix, image, args = command(name, spec)
    # Shared maintenance lock allows independent sources, blocks weather backup/deploy.
    with open(lock_dir / "weather.lock", "a") as maintenance, open(lock_dir / f"collector-{name}.lock", "a") as source_lock:
        fcntl.flock(maintenance, fcntl.LOCK_SH | fcntl.LOCK_NB)
        fcntl.flock(source_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for attempt in range(3):
            container = f"grenmet-collector-{name}-{uuid4().hex}"
            try:
                result = subprocess.run(prefix + ["--name", container, image] + args, timeout=3600, check=False)
                if result.returncode == 0:
                    print(f"{name}: completed successfully")
                    return
            except subprocess.TimeoutExpired:
                print(f"{name}: outer runtime limit exceeded", file=sys.stderr)
            finally:
                subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, check=False)
            if attempt < 2:
                time.sleep(60)
        raise RuntimeError("Collector failed after three bounded attempts")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    parser.add_argument("--config", default="/etc/grenmet/collectors.release.json")
    parser.add_argument("--lock-dir", type=Path, default=Path("/var/lock/grenmet"))
    args = parser.parse_args()
    try:
        config = json.loads(Path(args.config).read_text())
        run(args.name, config[args.name], args.lock_dir)
    except (ValueError, KeyError, OSError, RuntimeError, subprocess.SubprocessError):
        print("Collector failed or is unconfigured; inspect its configuration and source status", file=sys.stderr)
        sys.exit(1)
