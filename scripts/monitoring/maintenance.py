#!/usr/bin/env python3
"""CI entry point for environment-scoped core backup and isolated restore drills."""

import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inventory(environment):
    config = dict(
        line.split("=", 1)
        for line in (ROOT / f"infra/docker/{environment}.env").read_text().splitlines()
        if line and not line.startswith("#")
    )
    return [
        config[key]
        for key in (
            "POSTGRES_DB",
            "WXWATCH_DB_NAME",
            "WXPRODUCTS_DB_NAME",
            "JANITORIAL_DB_NAME",
            "TRANSPORT_DB_NAME",
            "EREGISTER_DB_NAME",
            "EVENTS_DB_NAME",
            "CMS_DB_NAME",
        )
    ]


def validate_manifest(manifest, environment, now):
    if manifest.get("environment") != environment or manifest.get(
        "absent_before_provisioning"
    ):
        raise ValueError("Incomplete or wrong-environment backup")
    completed = datetime.fromisoformat(manifest["completed_at"])
    if completed > now or now - completed > timedelta(hours=26):
        raise ValueError("Backup is stale or timestamp is invalid")
    rows = manifest["databases"]
    if sorted(row["database"] for row in rows) != sorted(inventory(environment)):
        raise ValueError("Backup inventory mismatch")
    batches = set()
    for row in rows:
        match = re.fullmatch(
            rf"{environment}/core/([0-9]{{8}}T[0-9]{{6}}Z-[0-9a-f]{{8}})/([a-zA-Z_][a-zA-Z0-9_]*)\.dump",
            row["key"],
        )
        if (
            not match
            or match[2] != row["database"]
            or type(row["bytes"]) is not int
            or row["bytes"] <= 0
        ):
            raise ValueError("Invalid backup object")
        batches.add(match[1])
    if len(batches) != 1:
        raise ValueError("Mixed backup batches")
    return rows


def restore(environment, project):
    bucket, endpoint = os.environ["DO_SPACES_BUCKET"], os.environ["DO_SPACES_ENDPOINT"]

    def download(key, path):
        run(
            [
                "aws",
                "s3",
                "cp",
                f"s3://{bucket}/{key}",
                str(path),
                "--endpoint-url",
                endpoint,
                "--only-show-errors",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

    with tempfile.TemporaryDirectory(prefix="grenmet-restore-") as temporary:
        directory = Path(temporary)
        marker = directory / "manifest.json"
        download(f"{environment}/core/latest-success.json", marker)
        rows = validate_manifest(
            json.loads(marker.read_text()), environment, datetime.now(timezone.utc)
        )
        required = max(5 * 1024**3, sum(row["bytes"] for row in rows) * 10)
        memory = dict(
            line.split(":", 1)
            for line in Path("/proc/meminfo").read_text().splitlines()
        )
        if (
            shutil.disk_usage(directory).free < required
            or int(memory["MemAvailable"].split()[0]) < 2 * 1024**2
        ):
            raise ValueError(
                "Insufficient restore capacity: require 2 GiB available memory and max(5 GiB, 10x dump bytes) disk"
            )
        containers = run(
            [
                "docker",
                "ps",
                "-q",
                "--filter",
                f"label=com.docker.compose.project={project}",
                "--filter",
                "label=com.docker.compose.service=db",
            ],
            capture_output=True,
            text=True,
        ).stdout.split()
        if len(containers) != 1:
            raise ValueError("Expected one source database container")
        image = run(
            ["docker", "inspect", "-f", "{{.Image}}", containers[0]],
            capture_output=True,
            text=True,
        ).stdout.strip()
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", image):
            raise ValueError("Restore requires an immutable local database image")
        for row in rows:
            target = directory / f"{row['database']}.dump"
            download(row["key"], target)
            if target.stat().st_size != row["bytes"]:
                raise ValueError("Downloaded dump size mismatch")
        password_file = directory / "container.conf"
        password_file.write_text(f"POSTGRES_PASSWORD={secrets.token_hex(32)}\n")
        password_file.chmod(0o600)
        name = f"grenmet-restore-{environment}-{secrets.token_hex(6)}"
        try:
            run(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    name,
                    "--label",
                    "grenmet.restore=true",
                    "--label",
                    "grenmet.restore.owner=monitoring-maintenance",
                    "--label",
                    f"grenmet.restore.environment={environment}",
                    "--label",
                    f"grenmet.restore.run={os.environ.get('GITHUB_RUN_ID', 'local')}",
                    "--network",
                    "none",
                    "--memory",
                    "1g",
                    "--memory-swap",
                    "1g",
                    "--cpus",
                    "1",
                    "--env-file",
                    str(password_file),
                    "--env",
                    "PGDATA=/var/lib/postgresql/data/pgdata",
                    "--tmpfs",
                    "/var/lib/postgresql/data:rw,size=1073741824",
                    "--health-cmd",
                    "pg_isready -U postgres",
                    "--health-interval",
                    "2s",
                    "--health-retries",
                    "30",
                    image,
                ],
                stdout=subprocess.DEVNULL,
            )
            import time

            for _ in range(60):
                if (
                    run(
                        ["docker", "inspect", "-f", "{{.State.Health.Status}}", name],
                        capture_output=True,
                        text=True,
                    ).stdout.strip()
                    == "healthy"
                ):
                    break
                time.sleep(2)
            else:
                raise ValueError("Restore database did not become ready")
            for index, row in enumerate(rows):
                database = f"restore_{index}"
                run(
                    ["docker", "exec", name, "createdb", "-U", "postgres", database],
                    capture_output=True,
                )
                with (directory / f"{row['database']}.dump").open("rb") as source:
                    run(
                        [
                            "docker",
                            "exec",
                            "-i",
                            name,
                            "pg_restore",
                            "-U",
                            "postgres",
                            "-d",
                            database,
                            "--exit-on-error",
                            "--no-owner",
                            "--no-privileges",
                        ],
                        stdin=source,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                    )
                # Check schema presence without exporting records or private identifiers.
                count = run(
                    [
                        "docker",
                        "exec",
                        name,
                        "psql",
                        "-U",
                        "postgres",
                        "-d",
                        database,
                        "-Atc",
                        "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
                    ],
                    capture_output=True,
                    text=True,
                )
                if int(count.stdout.strip()) == 0:
                    raise ValueError("Restored database has no application tables")
        finally:
            run(
                ["docker", "rm", "-fv", name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
    return {"databasesVerified": len(rows), "recordContentsExported": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["backup", "restore"])
    parser.add_argument(
        "--environment", choices=["staging", "production"], required=True
    )
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    project = "grenmet-staging" if args.environment == "staging" else "grenmet"
    report = {
        "owner": "gaa",
        "environment": args.environment,
        "operation": args.operation,
        "source": "github-actions",
        "release": os.environ.get("GITHUB_SHA", "unknown"),
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "status": "failed",
    }
    try:
        if args.operation == "backup":
            child_environment = dict(os.environ)
            child_environment.pop("BACKUP_HEARTBEAT_URL", None)
            run(
                [
                    "python3",
                    str(ROOT / "scripts/production/backup-core.py"),
                    args.environment,
                    project,
                    str(ROOT / f"infra/docker/{args.environment}.env"),
                ],
                env=child_environment,
            )
            report["backupStatus"] = "verified"
            report["heartbeatDelivery"] = "failed"
            if not os.environ.get("BACKUP_HEARTBEAT_URL"):
                raise ValueError("Missing backup heartbeat")
            run(
                [
                    "python3",
                    str(ROOT / "scripts/production/heartbeat.py"),
                    "BACKUP_HEARTBEAT_URL",
                ]
            )
            report["heartbeatDelivery"] = "accepted-by-provider"
        else:
            report.update(restore(args.environment, project))
        report["status"] = "verified"
    finally:
        report["completedAt"] = datetime.now(timezone.utc).isoformat()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        args.report.with_suffix(".md").write_text(
            f"# {args.environment} {args.operation}\n\nStatus: {report['status']}\n\nSource: GitHub Actions. Window: {report['startedAt']} to {report['completedAt']}.\n\nRelease: {report['release']}. Database contents are excluded.\n"
        )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError):
        raise SystemExit(
            "Maintenance failed; inspect configuration and capacity. No credentials or database contents are included in this report."
        ) from None
