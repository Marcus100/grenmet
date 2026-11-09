"""Add the daily rainfall, extreme temperatures and gust to the imported hourly drafts.

The observers send these values (the hourly sheet has none of them) in a small CSV with
one row per day; see ``src/eregister/daily_import.py`` for the columns and for exactly
where each value is stored. Without ``--apply`` nothing is written: every row is
checked and the preview says which hourly drafts would change. With ``--apply`` the
values are added to those drafts through the same save the API uses. Only a draft the
hourly importer made and nobody has reviewed is changed, a value already there is
never replaced, and any hour that cannot take its values is listed and left alone.

    uv run --frozen --package fast-back python scripts/import_daily_values.py --csv october_daily.csv
    uv run --frozen --package fast-back python scripts/import_daily_values.py --csv october_daily.csv --apply --actor admin

Run it with the same ``--actor`` as the hourly import: the register lets a draft be
edited in place only by the person who saved it. The CSV holds real observations: keep
it out of the repository (``temp-files/`` and ``/private/`` are ignored).
"""

import argparse
import asyncio
import csv
import os
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException
from sqlalchemy import select, text

from src.auth.models import User
from src.config import settings
from src.database import async_session_factory
from src.eregister import cl1_import, daily_import, database, entries
from src.eregister.config import eregister_settings
from src.eregister.schemas import RegisterObservationCreate
from src.exceptions import AppException

PROTECTED_DATABASES = {"app", "app_prod", "app_staging", "app_test", "postgres"}
SAMPLES = 3

_LIVE_ROWS = text(
    "SELECT observed_at, state::text AS state, body->>'notes' AS notes,"
    " review_outcome, body"
    " FROM register_observations WHERE station_id = :station AND kind = 'SYNOP'"
    " AND observed_at >= :start AND observed_at < :stop"
    " AND state NOT IN ('rejected', 'superseded')"
)


def summary(reports: list[daily_import.DayReport]) -> None:
    print(f"File rows read: {len(reports)}")
    for status, label in (
        ("ready", "have values that pass every check"),
        ("blocked", "have an error (nothing saved for the row)"),
        ("empty", "have no values"),
        ("unreadable", "have an unreadable date"),
    ):
        count = sum(1 for r in reports if r.status == status)
        if count:
            print(f"  {count:>4} days {label}")
    counts: Counter[tuple[str, str, str]] = Counter()
    first: dict[tuple[str, str, str], daily_import.DayReport] = {}
    for report in reports:
        for issue in report.issues:
            key: tuple[str, str, str] = (issue.severity, issue.field, issue.code)
            counts[key] += 1
            first.setdefault(key, report)
    print("\nIssues (errors first):")
    for key, count in sorted(
        counts.items(), key=lambda kv: (kv[0][0] != "error", -kv[1])
    ):
        where = first[key]
        when = str(where.day) if where.day else f"row {where.row}"
        print(f"  {count:>4} {key[0]:7} {key[1]} / {key[2]} (first: {when})")
    for report in reports:
        if report.status in ("blocked", "unreadable"):
            what = "; ".join(f"{i.field}: {i.message}" for i in report.errors[:SAMPLES])
            print(
                f"\nNot saved: file row {report.row}, {report.day or 'unknown date'}: {what}"
            )


def write_report(path: Path, reports: list[daily_import.DayReport]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["file_row", "date", "status", "severity", "field", "code", "message"]
        )
        for report in reports:
            day = str(report.day) if report.day else ""
            if not report.issues:
                writer.writerow([report.row, day, report.status, "", "", "", ""])
            for issue in report.issues:
                writer.writerow(
                    [
                        report.row,
                        day,
                        report.status,
                        issue.severity,
                        issue.field,
                        issue.code,
                        issue.message,
                    ]
                )
    print(f"\nFull report written to {path}")


def refuse_unless_local_register(allow_non_local: bool) -> None:
    expected = os.environ.get("EREGISTER_DB_NAME", "eregister")
    problem = cl1_import.local_register_problem(
        eregister_settings.DATABASE_URL, settings.ENVIRONMENT, expected
    )
    if problem and not allow_non_local:
        raise SystemExit(
            f"Refusing to save: {problem} This import is for the local register; "
            "pass --allow-non-local only with the owner's go."
        )
    if allow_non_local and expected in PROTECTED_DATABASES:
        raise SystemExit("Refusing to save into an application database.")


async def read_live(
    register: Any, reports: list[daily_import.DayReport]
) -> tuple[dict[datetime, daily_import.LiveRow], dict[datetime, dict[str, Any]]]:
    """Live rows for the hours the file touches, and every nearby hourly body."""
    days = [r.day for r in reports if r.day is not None]
    if not days:
        return {}, {}
    start = datetime.combine(min(days), datetime.min.time(), tzinfo=UTC) - timedelta(
        days=2
    )
    stop = datetime.combine(max(days), datetime.min.time(), tzinfo=UTC) + timedelta(
        days=3
    )
    result = await register.execute(
        _LIVE_ROWS, {"station": cl1_import.STATION_ID, "start": start, "stop": stop}
    )
    live: dict[datetime, daily_import.LiveRow] = {}
    bodies: dict[datetime, dict[str, Any]] = {}
    for row in result.mappings():
        body = row["body"] or {}
        bodies[row["observed_at"]] = body
        live[row["observed_at"]] = daily_import.LiveRow(
            state=row["state"],
            notes=row["notes"],
            review_outcome=row["review_outcome"],
            body=body,
        )
    return live, bodies


def show_plan(plans: list[daily_import.Planned]) -> None:
    updates = [p for p in plans if p.action == "update"]
    unchanged = [p for p in plans if p.action == "unchanged"]
    skipped = [p for p in plans if p.action == "skip"]
    print(
        f"\nHourly drafts: {len(updates)} would change, {len(unchanged)} already hold "
        f"these values, {len(skipped)} cannot take them."
    )
    for plan in skipped:
        print(
            f"  left alone: {plan.observed_at:%Y-%m-%d %H:%M} UTC "
            f"(file rows {', '.join(map(str, plan.rows))}): {plan.reason}"
        )


async def save(args: argparse.Namespace, plans: list[daily_import.Planned]) -> None:
    refuse_unless_local_register(args.allow_non_local)
    register = database.create_session()
    if register is None:
        raise SystemExit("EREGISTER_DATABASE_URL is not set.")
    saved = 0
    failed: list[str] = []
    async with async_session_factory() as app_session, register:
        connected = await register.scalar(text("SELECT current_database()"))
        expected = os.environ.get("EREGISTER_DB_NAME", "eregister")
        if connected != expected and not args.allow_non_local:
            raise SystemExit(f"Connected to {connected!r}, expected {expected!r}.")
        actor = (
            (await app_session.execute(select(User).where(User.username == args.actor)))
            .scalars()
            .first()
        )
        if actor is None:
            raise SystemExit(f"User {args.actor!r} not found.")
        for plan in plans:
            if plan.action != "update" or plan.body is None:
                continue
            when = f"{plan.observed_at:%Y-%m-%d %H:%M} UTC"
            data = RegisterObservationCreate(
                station_id=cl1_import.STATION_ID,
                kind="SYNOP",
                observed_at=plan.observed_at,
                body=plan.body,
            )
            try:
                await entries.create(
                    register=register, app_session=app_session, data=data, user=actor
                )
            except AppException as exc:
                failed.append(f"{when}: {exc.message}")
            except HTTPException as exc:
                failed.append(f"{when}: {exc.detail}")
            else:
                saved += 1
    print(f"\nAdded to {saved} hourly drafts, {len(failed)} refused.")
    for line in failed:
        print(f"  refused: {line}")
    if failed:
        raise SystemExit(1)


async def run(args: argparse.Namespace, rows: list[tuple[int, dict[str, str]]]) -> None:
    reports = daily_import.check_days(rows, utc_offset_hours=args.utc_offset_hours)
    register = database.create_session()
    plans: list[daily_import.Planned] = []
    if register is None:
        print(
            "Note: the register is not reachable, so the values are checked on their own "
            "and not against the hourly drafts.\n"
        )
    else:
        async with register:
            live, bodies = await read_live(register, reports)
        air = daily_import.hourly_air(bodies)
        for report in reports:
            if report.status == "ready":
                daily_import.check_against_hourly(
                    report, air, utc_offset_hours=args.utc_offset_hours
                )
        plans = daily_import.plan_merge(reports, live)
    summary(reports)
    if plans:
        show_plan(plans)
    if args.report:
        write_report(Path(args.report), reports)
    if args.apply:
        await save(args, plans)
    else:
        print(
            "\nPreview only: nothing was saved. Add --apply to add these values to the "
            "hourly drafts."
        )
    await database.close_engine()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--csv", required=True, help="The daily values saved as CSV")
    parser.add_argument(
        "--utc-offset-hours", type=int, default=daily_import.UTC_OFFSET_HOURS
    )
    parser.add_argument(
        "--report",
        help="Write every issue to this CSV file (keep it out of the repository)",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Add the values to the hourly drafts"
    )
    parser.add_argument(
        "--actor",
        default="admin",
        help="Username that saved the hourly drafts (only they can edit them)",
    )
    parser.add_argument(
        "--allow-non-local",
        action="store_true",
        help="Needed outside ENVIRONMENT=local (owner go only)",
    )
    args = parser.parse_args()
    try:
        rows = daily_import.read_daily(Path(args.csv).read_text(encoding="utf-8-sig"))
    except (OSError, daily_import.DailyFormatError) as exc:
        raise SystemExit(f"Cannot read {args.csv}: {exc}") from exc
    asyncio.run(run(args, rows))


if __name__ == "__main__":
    main()
