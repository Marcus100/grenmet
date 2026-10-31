#!/usr/bin/env python3
"""Collect private, aggregate-only operations receipts from existing sources.

The protected config is local-only. Never include its contents, command output,
database identifiers, or environment names beyond staging/production in errors.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ENVIRONMENTS = ("staging", "production")
SOURCES = (
    "eregister-sends",
    "wis2-sends",
    "worker-jobs",
    "notification-sweeps",
    "backups",
    "secrets",
)
TARGETS = {"eregister-sends": "email", "wis2-sends": "wis2"}
BACKUP_KINDS = {"core", "weather", "objects", "sutron"}
TRACKED_JOBS = {
    "process_cap_jobs",
    "ingest_cap_feeds",
    "send_notification_emails",
    "run_notification_sweeps",
}
OVERDUE_AFTER = "15 minutes"
SECRET_EXPIRY_WINDOW_DAYS = 21
COMMAND_TIMEOUT_SECONDS = 30


class Unavailable(RuntimeError):
    """A source could not provide a complete, trustworthy snapshot."""


Runner = Callable[..., subprocess.CompletedProcess[str]]


def run_command(
    args: list[str],
    *,
    input_text: str | None = None,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    timeout: int = COMMAND_TIMEOUT_SECONDS,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            input=input_text,
            text=True,
            capture_output=True,
            check=False,
            env=env,
            cwd=cwd,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Unavailable("source command unavailable") from exc


def load_protected_config(path: Path) -> dict[str, Any]:
    try:
        metadata = path.stat()
        if metadata.st_mode & 0o077:
            raise Unavailable("config permissions must be 0600 or stricter")
        value = json.loads(path.read_text(encoding="utf-8"))
    except Unavailable:
        raise
    except (OSError, json.JSONDecodeError) as exc:
        raise Unavailable("protected config unavailable") from exc
    if not isinstance(value, dict) or not isinstance(value.get("environments"), dict):
        raise Unavailable("protected config schema is invalid")
    return value


def environment_config(config: dict[str, Any], name: str) -> dict[str, Any]:
    value = config["environments"].get(name)
    if not isinstance(value, dict):
        raise Unavailable("environment config unavailable")
    return value


def send_sql(target: str) -> str:
    if target not in {"email", "wis2"}:
        raise Unavailable("unsupported send target")
    return f"""BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT
  COUNT(*) FILTER (WHERE status = 'failed')::bigint,
  COUNT(*) FILTER (
    WHERE status = 'queued'
      AND COALESCE(next_retry_at, created_at)
          < CURRENT_TIMESTAMP - INTERVAL '{OVERDUE_AFTER}'
  )::bigint
FROM public.eregister_send
WHERE target = '{target}';
COMMIT;
"""


def read_send_counts(
    database_url: str, target: str, runner: Runner = run_command
) -> int:
    if not isinstance(database_url, str) or not database_url.startswith(
        ("postgresql://", "postgres://")
    ):
        raise Unavailable("database URL unavailable")
    env = os.environ.copy()
    env["PGDATABASE"] = database_url
    result = runner(
        [
            "psql",
            "--quiet",
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--no-align",
            "--tuples-only",
            "--field-separator=,",
        ],
        input_text=send_sql(target),
        env=env,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    return parse_send_counts(result)


def parse_send_counts(result: subprocess.CompletedProcess[str]) -> int:
    """Failed plus overdue sends from the fixed aggregate query's one CSV row."""
    if result.returncode != 0:
        raise Unavailable("database aggregate unavailable")
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) != 1 or not re.fullmatch(r"[0-9]+,[0-9]+", lines[0]):
        raise Unavailable("database aggregate response invalid")
    failed, overdue = (int(part) for part in lines[0].split(","))
    return failed + overdue


def collect_send_counts(
    source: str, config: dict[str, Any], runner: Runner = run_command
) -> dict[str, int]:
    target = TARGETS[source]
    values: dict[str, int] = {}
    for name in ENVIRONMENTS:
        item = environment_config(config, name)
        values[name] = read_send_counts(item.get("databaseUrl"), target, runner)
    return values


def collect_metric_counts(
    source: str, config: dict[str, Any], runner: Runner = run_command
) -> dict[str, int]:
    values: dict[str, int] = {}
    for name in ENVIRONMENTS:
        item = environment_config(config, name)
        redis_url = item.get("telemetryRedisUrl")
        if not isinstance(redis_url, str) or not redis_url:
            raise Unavailable("telemetry source unavailable")
        env = os.environ.copy()
        env.update(
            TELEMETRY_ENABLED="true",
            TELEMETRY_ENVIRONMENT=name,
            TELEMETRY_REDIS_URL=redis_url,
        )
        result = runner(
            [
                "uv",
                "run",
                "--frozen",
                "--package",
                "fast-back",
                "python",
                "-m",
                "src.metrics_report",
                "--complete-day",
            ],
            env=env,
            cwd=ROOT / "apps" / "api" / "fastapi",
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            raise Unavailable("telemetry report unavailable")
        try:
            report = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise Unavailable("telemetry report invalid") from exc
        if (
            not isinstance(report, dict)
            or report.get("environment") != name
            or report.get("days") != 1
            # Only the previous, fully elapsed UTC day can be complete: a
            # rolling "today" window has not yet seen the daily sweep run.
            or report.get("windowKind") != "previous-UTC-day"
            or report.get("completeness") != "complete"
            or not isinstance(report.get("jobs"), dict)
        ):
            raise Unavailable("telemetry report incomplete")
        values[name] = job_failures(source, report["jobs"])
    return values


def job_failures(source: str, jobs: dict[str, Any]) -> int:
    """Failed runs of the source's tracked jobs; every tracked job must have run."""
    parsed: dict[str, dict[str, int]] = {}
    for field, count in jobs.items():
        if not isinstance(field, str) or "|" not in field:
            raise Unavailable("telemetry labels invalid")
        job, outcome = field.rsplit("|", 1)
        if job not in TRACKED_JOBS or outcome not in {"completed", "failed"}:
            raise Unavailable("telemetry labels incomplete")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise Unavailable("telemetry counts invalid")
        parsed.setdefault(job, {})[outcome] = count
    expected = (
        {"run_notification_sweeps"} if source == "notification-sweeps" else TRACKED_JOBS
    )
    if not expected.issubset(parsed):
        raise Unavailable("telemetry job coverage incomplete")
    return sum(parsed[job].get("failed", 0) for job in expected)


def collect_backup_counts(
    config: dict[str, Any], runner: Runner = run_command
) -> dict[str, int]:
    values: dict[str, int] = {}
    for name in ENVIRONMENTS:
        kinds = environment_config(config, name).get("backupKinds")
        if (
            not isinstance(kinds, list)
            or not kinds
            or any(
                not isinstance(kind, str) or kind not in BACKUP_KINDS for kind in kinds
            )
            or len(set(kinds)) != len(kinds)
        ):
            raise Unavailable("backup coverage config unavailable")
        result = runner(
            [
                sys.executable,
                str(ROOT / "scripts" / "production" / "check-backup-age.py"),
                name,
                *kinds,
            ],
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            raise Unavailable("backup freshness check failed or unavailable")
        values[name] = 0
    return values


def collect_secret_counts(config: dict[str, Any], now: datetime) -> dict[str, int]:
    values: dict[str, int] = {}
    for name in ENVIRONMENTS:
        secrets = environment_config(config, name).get("secrets")
        if not isinstance(secrets, list) or not secrets:
            raise Unavailable("secret expiry metadata unavailable")
        for item in secrets:
            if not isinstance(item, dict) or set(item) != {"expiresAt"}:
                raise Unavailable("secret expiry metadata invalid")
        values[name] = expiring_count([item["expiresAt"] for item in secrets], now)
    return values


def expiring_count(dates: list[Any], now: datetime) -> int:
    """How many timezone-aware ISO expiry dates fall within the warning window."""
    if not dates:
        raise Unavailable("secret expiry metadata unavailable")
    deadline = now + timedelta(days=SECRET_EXPIRY_WINDOW_DAYS)
    failures = 0
    for expires_at in dates:
        if not isinstance(expires_at, str):
            raise Unavailable("secret expiry metadata invalid")
        try:
            expiry = datetime.fromisoformat(expires_at)
        except ValueError as exc:
            raise Unavailable("secret expiry metadata invalid") from exc
        if expiry.tzinfo is None:
            raise Unavailable("secret expiry timezone missing")
        if expiry.astimezone(UTC) <= deadline:
            failures += 1
    return failures


def collect(
    source: str, config: dict[str, Any], runner: Runner = run_command
) -> dict[str, int]:
    if source in TARGETS:
        return collect_send_counts(source, config, runner)
    if source in {"worker-jobs", "notification-sweeps"}:
        return collect_metric_counts(source, config, runner)
    if source == "backups":
        return collect_backup_counts(config, runner)
    if source == "secrets":
        return collect_secret_counts(config, datetime.now(UTC))
    raise Unavailable("unsupported source")


def write_private_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, separators=(",", ":"), sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        temporary.unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None, runner: Runner = run_command) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=SOURCES, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        config = load_protected_config(args.config)
        environments = collect(args.source, config, runner)
        if set(environments) != set(ENVIRONMENTS) or any(
            isinstance(value, bool) or not isinstance(value, int) or value < 0
            for value in environments.values()
        ):
            raise Unavailable("aggregate result incomplete")
        receipt = {
            "source": args.source,
            "observedAt": datetime.now(UTC).isoformat(),
            "complete": True,
            # audit-daily.mjs reads environments.<name>.failures.
            "environments": {
                name: {"failures": value} for name, value in environments.items()
            },
        }
        write_private_json(args.output, receipt)
        sys.stdout.write("Audit aggregate receipt written.\n")
        return 0
    except Unavailable as exc:
        # The message is a fixed category only; command/config values are never shown.
        sys.stderr.write(f"Audit source unavailable: {exc}\n")
        return 2
    except OSError:
        sys.stderr.write("Audit receipt could not be written.\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
