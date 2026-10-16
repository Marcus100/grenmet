#!/usr/bin/env python3
"""Timed restore drill (ADR-0021): rebuild every core database from the latest
off-host backup in a throwaway PostgreSQL container and check it matches the code.

Reads backups only. It never connects to a live database, keeps the restored data
in a tmpfs-backed container, prints table names and row counts but never row
contents, and always removes the container and the downloaded dumps.
"""

import argparse
import datetime
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DB_NAME = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")
VERSION_TABLE = re.compile(r"(?:[a-z0-9_]+_)?alembic_version")
DEFAULT_MAX_SECONDS = 2 * 60 * 60
DEFAULT_MAX_AGE_HOURS = 24
# Payload CMS tracks its own migrations; it has no Alembic version table.
DEFAULT_NON_ALEMBIC = "cms"
# The scheduled production backup (backup-database.yml) writes one dump per database
# to production/YYYY/MM/DD/<database>_<YYYYMMDD_HHMMSS>.dump and no marker file.
DAILY_DUMP = re.compile(r"(.+)_(\d{8}_\d{6})\.dump")
DAILY_REQUIRED = (
    "app_prod",
    "wxwatch",
    "wxproducts",
    "janitorial",
    "transport",
    "eregister",
    "events",
)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def read_manifest(marker, environment, now, max_age_hours=DEFAULT_MAX_AGE_HOURS):
    """Validate the latest-success marker and return [(database, object key)]."""
    completed = datetime.datetime.fromisoformat(marker["completed_at"])
    if completed.tzinfo is None:
        raise ValueError("Backup timestamp must include a timezone")
    age = now - completed
    if (
        marker.get("environment") != environment
        or age.total_seconds() < 0
        or age > datetime.timedelta(hours=max_age_hours)
    ):
        raise ValueError(f"Backup is invalid or older than {max_age_hours} hours")
    entries = marker.get("databases") or []
    names = [item["database"] for item in entries]
    if not names or len(set(names)) != len(names):
        raise ValueError("Backup manifest must list each database once")
    prefix = f"{environment}/core/"
    result = []
    for item in entries:
        key = item["key"]
        if not DB_NAME.fullmatch(item["database"]):
            raise ValueError("Backup manifest has an invalid database name")
        if not key.startswith(prefix) or ".." in key.split("/") or key.endswith("/"):
            raise ValueError("Backup manifest has an unexpected object key")
        result.append((item["database"], key))
    return result


def discover_daily(
    keys, now, required=DAILY_REQUIRED, max_age_hours=DEFAULT_MAX_AGE_HOURS
):
    """Pick the newest dump per database from the scheduled backup's object keys.

    Every required database must have a dump no older than ``max_age_hours``; extra
    databases found (such as the CMS) are restored too.
    """
    newest = {}
    for key in keys:
        parts = key.split("/")
        match = DAILY_DUMP.fullmatch(parts[-1])
        if parts[0] != "production" or len(parts) != 5 or not match:
            continue
        name, stamp = match.groups()
        if not DB_NAME.fullmatch(name) or ".." in parts:
            continue
        taken = datetime.datetime.strptime(stamp, "%Y%m%d_%H%M%S").replace(
            tzinfo=datetime.UTC
        )
        if name not in newest or taken > newest[name][0]:
            newest[name] = (taken, key)
    missing = [name for name in required if name not in newest]
    if missing:
        raise ValueError(f"No recent backup found for: {', '.join(missing)}")
    cutoff = now - datetime.timedelta(hours=max_age_hours)
    stale = sorted(name for name in required if newest[name][0] < cutoff)
    if stale:
        raise ValueError(
            f"Backup older than {max_age_hours} hours for: {', '.join(stale)}"
        )
    return [(name, newest[name][1]) for name in sorted(newest)]


def version_table_of(tables):
    """The single Alembic version table among a database's tables, or None."""
    found = sorted(t for t in tables if VERSION_TABLE.fullmatch(t))
    if len(found) > 1:
        raise ValueError("More than one Alembic version table")
    return found[0] if found else None


def check_database(name, version_table, revision, counts, heads, floors, non_alembic):
    """Return the problems with one restored database (empty list means it passed).

    ``counts`` maps each user table to its row count; ``version_table`` and
    ``revision`` are the database's Alembic version table and current revision.
    """
    problems = []
    if not counts:
        return [f"{name}: restored with no tables"]
    if version_table is None:
        if not any(marker in name for marker in non_alembic):
            problems.append(f"{name}: no Alembic version table")
    elif version_table not in heads:
        problems.append(f"{name}: no code head recorded for {version_table}")
    elif revision != heads[version_table]:
        problems.append(
            f"{name}: migration drift, backup is at {revision} but the code head is "
            f"{heads[version_table]}"
        )
    if sum(counts.values()) == 0:
        problems.append(f"{name}: every table restored empty")
    for table, floor in sorted(floors.get(name, {}).items()):
        if counts.get(table, 0) < floor:
            problems.append(
                f"{name}: {table} has {counts.get(table, 0)} rows, below the floor of {floor}"
            )
    return problems


def render_summary(environment, results, timings, max_seconds, problems):
    total = sum(timings.values())
    verdict = "PASSED" if not problems and total <= max_seconds else "FAILED"
    lines = [
        f"## Restore drill: {verdict}",
        "",
        f"- Environment: {environment}",
        f"- Total time: {total:.0f}s of {max_seconds}s allowed",
        (
            "- Not yet verified: starting the API against the restored databases "
            "(ADR-0021 step 4), so recovery time is not yet proven end to end."
        ),
        "",
        "| Phase | Seconds |",
        "| --- | --- |",
    ]
    lines += [f"| {phase} | {seconds:.0f} |" for phase, seconds in timings.items()]
    lines += [
        "",
        "| Database | Tables | Rows | Migration |",
        "| --- | --- | --- | --- |",
    ]
    for name, info in results.items():
        lines.append(
            f"| {name} | {info['tables']} | {info['rows']} | {info['revision'] or 'none'} |"
        )
    if total > max_seconds:
        problems = [*problems, f"total time {total:.0f}s exceeded {max_seconds}s"]
    if problems:
        lines += ["", "### Problems", *[f"- {item}" for item in problems]]
    return "\n".join(lines) + "\n", verdict == "PASSED"


def describe(error):
    """A log-safe description: tool output and arguments can quote data or secrets."""
    if isinstance(error, subprocess.CalledProcessError):
        return f"{Path(str(error.cmd[0])).name} exited with {error.returncode}"
    return f"{type(error).__name__}: {error}"


class Source:
    """Where the dumps come from: an S3-compatible bucket, or a local directory."""

    def __init__(self, environment, source_dir=None):
        self.environment = environment
        self.source_dir = Path(source_dir) if source_dir else None
        if not self.source_dir:
            for key in ("DO_SPACES_BUCKET", "DO_SPACES_ENDPOINT", "AWS_ACCESS_KEY_ID"):
                if not os.environ.get(key):
                    raise ValueError(f"{key} is required")

    def exists(self, key):
        if self.source_dir:
            return (self.source_dir / key).is_file()
        result = subprocess.run(
            [
                "aws",
                "s3api",
                "head-object",
                "--bucket",
                os.environ["DO_SPACES_BUCKET"],
                "--key",
                key,
                "--endpoint-url",
                os.environ["DO_SPACES_ENDPOINT"],
            ],
            capture_output=True,
            check=False,
        )
        return result.returncode == 0

    def list_daily(self, now, days=3):
        """Object keys under production/YYYY/MM/DD/ for today and the days before."""
        keys = []
        for offset in range(days):
            day = (now - datetime.timedelta(days=offset)).strftime("%Y/%m/%d")
            prefix = f"production/{day}/"
            if self.source_dir:
                folder = self.source_dir / prefix
                keys += (
                    [f"{prefix}{p.name}" for p in folder.glob("*.dump")]
                    if folder.is_dir()
                    else []
                )
                continue
            listing = run(
                [
                    "aws",
                    "s3api",
                    "list-objects-v2",
                    "--bucket",
                    os.environ["DO_SPACES_BUCKET"],
                    "--prefix",
                    prefix,
                    "--query",
                    "Contents[].Key",
                    "--output",
                    "json",
                    "--endpoint-url",
                    os.environ["DO_SPACES_ENDPOINT"],
                ],
                capture_output=True,
                text=True,
            ).stdout
            keys += json.loads(listing or "null") or []
        return keys

    def fetch(self, key, destination):
        if self.source_dir:
            shutil.copyfile(self.source_dir / key, destination)
            return
        run(
            [
                "aws",
                "s3",
                "cp",
                f"s3://{os.environ['DO_SPACES_BUCKET']}/{key}",
                str(destination),
                "--endpoint-url",
                os.environ["DO_SPACES_ENDPOINT"],
                "--only-show-errors",
            ]
        )


class ThrowawayPostgres:
    def __init__(self, image, tmpfs_size):
        self.name = f"restore-drill-{secrets.token_hex(4)}"
        self.image = image
        self.tmpfs_size = tmpfs_size
        self.password = secrets.token_urlsafe(24)

    def start(self):
        run(
            [
                "docker",
                "run",
                "-d",
                "--rm",
                "--name",
                self.name,
                # Passed by name so the value stays out of the command line and of
                # any CalledProcessError message.
                "-e",
                "POSTGRES_PASSWORD",
                "--tmpfs",
                f"/var/lib/postgresql/data:rw,size={self.tmpfs_size}",
                self.image,
            ],
            stdout=subprocess.DEVNULL,
            env={**os.environ, "POSTGRES_PASSWORD": self.password},
        )
        for _ in range(90):
            ready = subprocess.run(
                ["docker", "exec", self.name, "pg_isready", "-U", "postgres"],
                capture_output=True,
                check=False,
            )
            if ready.returncode == 0:
                return
            time.sleep(1)
        raise RuntimeError("Throwaway PostgreSQL did not become ready")

    def psql(self, database, sql):
        return run(
            [
                "docker",
                "exec",
                self.name,
                "psql",
                "-X",
                "-At",
                "-F",
                "|",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "postgres",
                "-d",
                database,
                "-c",
                sql,
            ],
            capture_output=True,
            text=True,
        ).stdout.splitlines()

    def restore(self, database, dump):
        run(
            ["docker", "exec", self.name, "createdb", "-U", "postgres", database],
            stdout=subprocess.DEVNULL,
        )
        with Path(dump).open("rb") as source:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    "-i",
                    self.name,
                    "pg_restore",
                    "-U",
                    "postgres",
                    "--no-owner",
                    "--no-privileges",
                    "--exit-on-error",
                    "-d",
                    database,
                ],
                stdin=source,
                capture_output=True,
                check=False,
            )
        if result.returncode:
            # pg_restore errors can quote data; report only that it failed.
            raise RuntimeError(
                f"pg_restore failed for {database} (exit {result.returncode})"
            )

    def inspect(self, database):
        self.psql(database, "ANALYZE")
        version_tables = self.psql(
            database,
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name LIKE '%alembic_version'",
        )
        counts = {}
        for line in self.psql(
            database,
            "SELECT schemaname || '.' || relname, n_live_tup FROM pg_stat_user_tables",
        ):
            table, rows = line.rsplit("|", 1)
            counts[table] = int(rows)
        version_table = version_table_of(version_tables)
        revision = None
        if version_table:
            revision = (
                self.psql(database, f"SELECT version_num FROM public.{version_table}")
                or [None]
            )[0]
        return counts, version_table, revision

    def stop(self):
        subprocess.run(
            ["docker", "rm", "-f", self.name], capture_output=True, check=False
        )


def drill(args):
    environment = args.environment
    heads = json.loads(Path(args.heads).read_text())
    floors = (
        json.loads(Path(args.floors).read_text())
        if args.floors and Path(args.floors).exists()
        else {}
    )
    non_alembic = [item for item in args.non_alembic.split(",") if item]
    source = Source(environment, args.source_dir)
    work = Path(tempfile.mkdtemp(prefix="restore-drill-"))
    work.chmod(0o700)
    postgres = ThrowawayPostgres(args.image, args.tmpfs_size)
    timings, results, problems = {}, {}, []
    try:
        started = time.monotonic()
        now = datetime.datetime.now(datetime.UTC)
        marker_key = f"{environment}/core/latest-success.json"
        if source.exists(marker_key):
            marker_path = work / "latest-success.json"
            source.fetch(marker_key, marker_path)
            entries = read_manifest(
                json.loads(marker_path.read_text()),
                environment,
                now,
                args.max_age_hours,
            )
        elif environment == "production":
            entries = discover_daily(
                source.list_daily(now),
                now,
                tuple(item for item in args.required.split(",") if item),
                args.max_age_hours,
            )
        else:
            raise ValueError(f"No backup marker found for {environment}")
        dumps = {}
        for name, key in entries:
            dumps[name] = work / f"{name}.dump"
            source.fetch(key, dumps[name])
        timings["download"] = time.monotonic() - started

        started = time.monotonic()
        postgres.start()
        timings["start database"] = time.monotonic() - started

        started = time.monotonic()
        for name, dump in dumps.items():
            postgres.restore(name, dump)
            dump.unlink()
        timings["restore"] = time.monotonic() - started

        started = time.monotonic()
        for name in dumps:
            counts, version_table, revision = postgres.inspect(name)
            results[name] = {
                "tables": len(counts),
                "rows": sum(counts.values()),
                "revision": revision,
                "counts": counts,
            }
            problems += check_database(
                name, version_table, revision, counts, heads, floors, non_alembic
            )
        timings["verify"] = time.monotonic() - started
    except (
        OSError,
        ValueError,
        KeyError,
        RuntimeError,
        subprocess.SubprocessError,
    ) as error:
        problems.append(f"drill stopped: {describe(error)}")
    finally:
        postgres.stop()
        shutil.rmtree(work, ignore_errors=True)
    summary, passed = render_summary(
        environment, results, timings, args.max_seconds, problems
    )
    print(summary)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a") as output:
            output.write(summary)
    if args.result_file:
        Path(args.result_file).write_text(
            json.dumps(
                {"passed": passed, "timings": timings, "databases": results}, indent=2
            )
            + "\n"
        )
    return 0 if passed else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment", choices=["staging", "production"])
    parser.add_argument(
        "--heads", required=True, help="JSON map of version table to code head"
    )
    parser.add_argument(
        "--floors", help="JSON map of database to table to minimum rows"
    )
    parser.add_argument(
        "--source-dir", help="Read backups from a local directory (tests)"
    )
    parser.add_argument(
        "--result-file", help="Write counts and timings as JSON (no row contents)"
    )
    parser.add_argument(
        "--image", default=os.environ.get("CORE_POSTGRES_IMAGE", "postgres:17")
    )
    parser.add_argument("--tmpfs-size", default="4g")
    parser.add_argument("--max-seconds", type=int, default=DEFAULT_MAX_SECONDS)
    parser.add_argument("--max-age-hours", type=int, default=DEFAULT_MAX_AGE_HOURS)
    parser.add_argument("--non-alembic", default=DEFAULT_NON_ALEMBIC)
    parser.add_argument(
        "--required",
        default=",".join(DAILY_REQUIRED),
        help="Databases that must have a recent daily dump",
    )
    return drill(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
