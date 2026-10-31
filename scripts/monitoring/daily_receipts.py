#!/usr/bin/env python3
"""Collect one environment's daily, aggregate-only monitoring receipt on its droplet.

Runs from `.github/workflows/monitoring-daily.yml` on the environment's own
self-hosted runner, so it reaches the private database and Redis containers
directly. Every source is read-only:

- eRegister and WIS2 sends: the same fixed `BEGIN READ ONLY` aggregate query as
  `scripts/agents/audit-operations.py`, as a dedicated read-only role.
- Worker jobs and notification sweeps: one `HGETALL` of the previous full UTC
  day's job-counter hash.
- Backups: each kind's `latest-success.json` marker with a read-only Spaces key.
- Secrets: owner-maintained expiry dates (no names, no values).
- Sentry: counts of new and regressed issues through a read-only API token.

The receipt holds counts and fixed failure categories only. It never contains
command output, credentials, identifiers, issue titles or personal data.

Runs on the droplet's system `python3` with the standard library only; keep it
free of syntax newer than Python 3.11.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Share the WSL collector's SQL, parsers and private writer, and the backup
# marker rules, so both paths count exactly the same things.
ops = _load("audit_operations", ROOT / "scripts/agents/audit-operations.py")
backup_age = _load("check_backup_age", ROOT / "scripts/production/check-backup-age.py")
Unavailable = ops.Unavailable

SOURCES = (
    "sentry",
    "eregister-sends",
    "wis2-sends",
    "worker-jobs",
    "notification-sweeps",
    "secrets",
    "backups",
)
COMPOSE_PROJECTS = {"staging": "grenmet-staging", "production": "grenmet"}
ROLE = re.compile(r"[a-z_][a-z0-9_]{0,62}")
SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,49}")
BUCKET = re.compile(r"[a-z0-9][a-z0-9.-]{1,62}")
CONTAINER = re.compile(r"[0-9a-f]{12,64}")
REDIS_FIELD = re.compile(r"[a-z_]{1,64}\|(completed|failed)")
MAX_RESPONSE_BYTES = 1_000_000
# What check_marker raises for a stale, incomplete or malformed marker. A named
# tuple keeps this file valid on the droplet's system Python (older than 3.14).
MARKER_ERRORS = (KeyError, IndexError, TypeError, ValueError, AttributeError)
SENTRY_QUERIES = (
    # New in the last day, then regressed and still seen in the last day.
    "is:unresolved firstSeen:-24h",
    "is:unresolved is:regressed lastSeen:-24h",
)

Runner = Callable[..., Any]
Fetch = Callable[[str, str], Any]


def deploy_config(environment: str) -> dict[str, str]:
    """Committed, non-secret deploy settings (database names) for the environment."""
    path = ROOT / f"infra/docker/{environment}.env"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise Unavailable("deploy configuration unavailable") from exc
    return dict(
        line.split("=", 1)
        for line in lines
        if line and not line.startswith("#") and "=" in line
    )


def docker_env(env: dict[str, str]) -> dict[str, str]:
    """The docker CLI never needs the job's tokens or keys."""
    keep = ("PATH", "HOME", "LANG", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CONTEXT")
    return {name: env[name] for name in keep if env.get(name)}


def compose_container(
    environment: str, service: str, env: dict[str, str], runner: Runner
) -> str:
    result = runner(
        [
            "docker",
            "ps",
            "-q",
            "--no-trunc",
            "--filter",
            f"label=com.docker.compose.project={COMPOSE_PROJECTS[environment]}",
            "--filter",
            f"label=com.docker.compose.service={service}",
        ],
        env=docker_env(env),
    )
    ids = result.stdout.split() if result.returncode == 0 else []
    if len(ids) != 1 or not CONTAINER.fullmatch(ids[0]):
        raise Unavailable(f"{service} container unavailable")
    return ids[0]


def send_failures(
    environment: str, target: str, env: dict[str, str], runner: Runner
) -> int:
    role = env.get("MONITORING_DB_ROLE") or "grenmet_monitor"
    if not ROLE.fullmatch(role):
        raise Unavailable("database role name invalid")
    database = deploy_config(environment).get("EREGISTER_DB_NAME", "")
    if not ROLE.fullmatch(database):
        raise Unavailable("eRegister database name unavailable")
    container = compose_container(environment, "db", env, runner)
    # The local socket inside the container authenticates the read-only role;
    # the role has no password, so it cannot log in over the network.
    result = runner(
        [
            "docker",
            "exec",
            "-i",
            container,
            "psql",
            "--quiet",
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--no-align",
            "--tuples-only",
            "--field-separator=,",
            "--username",
            role,
            "--dbname",
            database,
        ],
        input_text=ops.send_sql(target),
        env=docker_env(env),
    )
    return ops.parse_send_counts(result)


def job_counters(
    environment: str, env: dict[str, str], runner: Runner, now: datetime
) -> dict[str, int]:
    day = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    key = f"telemetry:v1:{environment}:jobs:{day}"
    container = compose_container(environment, "redis", env, runner)
    result = runner(
        ["docker", "exec", container, "redis-cli", "--raw", "-n", "0", "HGETALL", key],
        env=docker_env(env),
    )
    if result.returncode != 0:
        raise Unavailable("telemetry counters unavailable")
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise Unavailable("telemetry job coverage incomplete")
    if len(lines) % 2:
        raise Unavailable("telemetry counters response invalid")
    jobs: dict[str, int] = {}
    for field, value in zip(lines[::2], lines[1::2], strict=True):
        if not REDIS_FIELD.fullmatch(field) or not value.isdigit():
            raise Unavailable("telemetry counters response invalid")
        jobs[field] = int(value)
    return jobs


def backup_failures(
    environment: str, env: dict[str, str], runner: Runner, now: datetime
) -> int:
    kinds = [kind.strip() for kind in env.get("MONITORING_BACKUP_KINDS", "").split(",")]
    kinds = [kind for kind in kinds if kind]
    if (
        not kinds
        or len(set(kinds)) != len(kinds)
        or any(kind not in ops.BACKUP_KINDS for kind in kinds)
    ):
        raise Unavailable("backup coverage config unavailable")
    bucket = env.get("MONITORING_SPACES_BUCKET", "")
    endpoint = urllib.parse.urlsplit(env.get("MONITORING_SPACES_ENDPOINT", ""))
    if (
        not BUCKET.fullmatch(bucket)
        or endpoint.scheme != "https"
        or not endpoint.hostname
        or endpoint.username
        or endpoint.password
        or endpoint.path not in {"", "/"}
        or endpoint.query
    ):
        raise Unavailable("backup storage config unavailable")
    if not (
        env.get("MONITORING_SPACES_KEY_ID") and env.get("MONITORING_SPACES_SECRET_KEY")
    ):
        raise Unavailable("backup read credentials unavailable")
    aws_env = {
        "PATH": env.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": env.get("RUNNER_TEMP") or env.get("HOME", "/tmp"),
        "LANG": "C.UTF-8",
        "AWS_ACCESS_KEY_ID": env["MONITORING_SPACES_KEY_ID"],
        "AWS_SECRET_ACCESS_KEY": env["MONITORING_SPACES_SECRET_KEY"],
        "AWS_DEFAULT_REGION": env.get("MONITORING_SPACES_REGION") or "us-east-1",
        "AWS_EC2_METADATA_DISABLED": "true",
    }
    failures = 0
    for kind in kinds:
        result = runner(
            [
                "aws",
                "s3",
                "cp",
                f"s3://{bucket}/{environment}/{kind}/latest-success.json",
                "-",
                "--endpoint-url",
                f"https://{endpoint.netloc}",
                "--only-show-errors",
            ],
            env=aws_env,
        )
        if result.returncode != 0 or len(result.stdout) > MAX_RESPONSE_BYTES:
            raise Unavailable("backup marker unavailable")
        try:
            marker = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise Unavailable("backup marker invalid") from exc
        try:
            backup_age.check_marker(marker, environment, kind, now)
        except MARKER_ERRORS:
            # A readable marker that is stale or incomplete is a real failure.
            failures += 1
    return failures


def secret_failures(env: dict[str, str], now: datetime) -> int:
    raw = env.get("MONITORING_SECRET_EXPIRY_DATES", "")
    return ops.expiring_count([d.strip() for d in raw.split(",") if d.strip()], now)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def sentry_fetch(url: str, token: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "grenmet-monitoring"},
    )
    # Never forwarded if a response tries to redirect elsewhere.
    request.add_unredirected_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=15) as response:
            if response.status != 200:
                raise Unavailable("Sentry API unavailable")
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise Unavailable("Sentry API unavailable") from exc
    if len(body) > MAX_RESPONSE_BYTES:
        raise Unavailable("Sentry API response too large")
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise Unavailable("Sentry API response invalid") from exc


def sentry_failures(env: dict[str, str], fetch: Fetch = sentry_fetch) -> int:
    org = env.get("MONITORING_SENTRY_ORG", "")
    project = env.get("MONITORING_SENTRY_PROJECT", "")
    token = env.get("MONITORING_SENTRY_TOKEN", "")
    if not (SLUG.fullmatch(org) and SLUG.fullmatch(project)):
        raise Unavailable("Sentry organisation or project unavailable")
    if not token:
        raise Unavailable("Sentry read token unavailable")
    base = urllib.parse.urlsplit(
        env.get("MONITORING_SENTRY_URL") or "https://sentry.io"
    )
    host = base.hostname or ""
    if (
        base.scheme != "https"
        or not (host == "sentry.io" or host.endswith(".sentry.io"))
        or base.username
        or base.password
        or base.path not in {"", "/"}
        or base.query
    ):
        raise Unavailable("Sentry API address invalid")
    origin = f"https://{base.netloc}"
    details = fetch(f"{origin}/api/0/projects/{org}/{project}/", token)
    project_id = str(details.get("id", "")) if isinstance(details, dict) else ""
    if not project_id.isdigit():
        raise Unavailable("Sentry project unavailable")
    issues: set[str] = set()
    for query in SENTRY_QUERIES:
        params = urllib.parse.urlencode(
            {"project": project_id, "query": query, "statsPeriod": "14d", "limit": 100}
        )
        page = fetch(f"{origin}/api/0/organizations/{org}/issues/?{params}", token)
        if not isinstance(page, list):
            raise Unavailable("Sentry API response invalid")
        for item in page:
            issue_id = str(item.get("id", "")) if isinstance(item, dict) else ""
            if not issue_id.isdigit():
                raise Unavailable("Sentry API response invalid")
            # Only the opaque numeric ID is kept, to de-duplicate the two queries.
            issues.add(issue_id)
    return len(issues)


def collect_source(
    source: str,
    environment: str,
    env: dict[str, str],
    runner: Runner,
    fetch: Fetch,
    now: datetime,
) -> int:
    if source == "sentry":
        return sentry_failures(env, fetch)
    if source in ops.TARGETS:
        return send_failures(environment, ops.TARGETS[source], env, runner)
    if source in {"worker-jobs", "notification-sweeps"}:
        return ops.job_failures(source, job_counters(environment, env, runner, now))
    if source == "backups":
        return backup_failures(environment, env, runner, now)
    if source == "secrets":
        return secret_failures(env, now)
    raise Unavailable("unsupported source")


def collect(
    environment: str,
    env: dict[str, str],
    runner: Runner = ops.run_command,
    fetch: Fetch = sentry_fetch,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    sources: dict[str, dict[str, Any]] = {}
    for source in SOURCES:
        try:
            failures = collect_source(source, environment, env, runner, fetch, now)
            if (
                isinstance(failures, bool)
                or not isinstance(failures, int)
                or failures < 0
            ):
                raise Unavailable("aggregate result incomplete")
            sources[source] = {"complete": True, "failures": failures}
        except Unavailable as exc:
            # Fixed category strings only; never command output or values.
            sources[source] = {"complete": False, "reason": str(exc)}
        except Exception:  # noqa: BLE001 - one broken source must not hide the rest
            sources[source] = {"complete": False, "reason": "collector error"}
    return {
        "version": 1,
        "environment": environment,
        "observedAt": now.isoformat(),
        "sources": sources,
    }


def summary(receipt: dict[str, Any]) -> str:
    rows = [
        f"### Daily monitoring receipt: {receipt['environment']}",
        "",
        "| Source | Complete | Failures | Reason |",
        "| --- | --- | --- | --- |",
    ]
    for source, item in receipt["sources"].items():
        rows.append(
            f"| {source} | {'yes' if item['complete'] else 'no'} "
            f"| {item.get('failures', '')} | {item.get('reason', '')} |"
        )
    return "\n".join(rows) + "\n"


def main(
    argv: list[str] | None = None,
    runner: Runner = ops.run_command,
    fetch: Fetch = sentry_fetch,
) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=tuple(COMPOSE_PROJECTS), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args(argv)
    receipt = collect(args.environment, dict(os.environ), runner, fetch)
    try:
        ops.write_private_json(args.output, receipt)
        if args.summary:
            with args.summary.open("a", encoding="utf-8") as stream:
                stream.write(summary(receipt))
    except OSError:
        sys.stderr.write("Daily monitoring receipt could not be written.\n")
        return 2
    complete = sum(item["complete"] for item in receipt["sources"].values())
    sys.stdout.write(
        f"Daily monitoring receipt written: {complete}/{len(SOURCES)} sources complete.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
