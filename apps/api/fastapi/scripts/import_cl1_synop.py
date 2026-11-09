"""Check a month of the hourly register sheet (CL1) and, with --apply, save it as drafts.

Save the sheet from Excel as CSV (first row is the header, 37 columns). Without
``--apply`` nothing is written: every hour is converted and checked with the register's
own SYNOP rules and a summary is printed. With ``--apply`` the hours that pass are saved
as draft SYNOP observations for station 78958, oldest first, exactly as the API saves
them (so the hour-to-hour checks see the hours already saved). Hours with an error are
never saved and never changed; they are listed so the observers can correct the sheet
or key the hour in the register. Saving again is safe: the same hour is updated in
place only when it is a draft this importer made and nobody has reviewed; any other
entry for that hour (typed by an observer, reviewed, accepted) is left alone and listed.

    uv run --frozen --package fast-back python scripts/import_cl1_synop.py --csv october.csv
    uv run --frozen --package fast-back python scripts/import_cl1_synop.py --csv october.csv --report issues.csv
    uv run --frozen --package fast-back python scripts/import_cl1_synop.py --csv october.csv --apply --actor admin

The sheet's hours are local standard time; ``--utc-offset-hours`` (default 4, Grenada)
converts them to the UTC the register stores. The CSV holds real observations: keep it
out of the repository (``temp-files/`` and ``/private/`` are ignored).
"""

import argparse
import asyncio
import csv
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException
from sqlalchemy import select, text

from src.auth.models import User
from src.config import settings
from src.database import async_session_factory
from src.eregister import cl1_import, database, entries, stations
from src.eregister.config import eregister_settings
from src.eregister.schemas import RegisterObservationCreate
from src.exceptions import AppException

PROTECTED_DATABASES = {"app", "app_prod", "app_staging", "app_test", "postgres"}
SAMPLES = 3
HTTP_CONFLICT = 409


def summary(reports: list[cl1_import.HourReport]) -> None:
    print(f"Sheet rows read: {len(reports)}")
    for status, label in (
        ("ready", "pass every rule (would be saved)"),
        ("blocked", "have an error (not saved)"),
        ("not_observed", "were not observed (row of zeros)"),
        ("unreadable", "have an unreadable date"),
    ):
        count = sum(1 for r in reports if r.status == status)
        if count:
            print(f"  {count:>4} hours {label}")
    counts: Counter[tuple[str, str, str]] = Counter()
    first: dict[tuple[str, str, str], cl1_import.HourReport] = {}
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
        when = f"{where.local:%d %b %H:%M} local" if where.local else f"row {where.row}"
        print(f"  {count:>4} {key[0]:7} {key[1]} / {key[2]} (first: {when})")
    for report in reports:
        if report.status in ("blocked", "unreadable"):
            what = "; ".join(f"{i.field}: {i.message}" for i in report.errors[:SAMPLES])
            when = (
                f"{report.local:%Y-%m-%d %H:%M} local"
                if report.local
                else "unknown time"
            )
            print(f"\nNot saved: sheet row {report.row}, {when}: {what}")
        elif report.status == "not_observed":
            print(
                f"\nNot observed: sheet row {report.row}, {report.local:%Y-%m-%d %H:%M} local"
            )


def write_report(path: Path, reports: list[cl1_import.HourReport]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "sheet_row",
                "local_time",
                "utc_time",
                "status",
                "severity",
                "field",
                "code",
                "message",
            ]
        )
        for report in reports:
            local = f"{report.local:%Y-%m-%d %H:%M}" if report.local else ""
            utc = f"{report.observed_at:%Y-%m-%d %H:%M}" if report.observed_at else ""
            if not report.issues:
                writer.writerow([report.row, local, utc, report.status, "", "", "", ""])
            for issue in report.issues:
                writer.writerow(
                    [
                        report.row,
                        local,
                        utc,
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


_LIVE_ROW = text(
    "SELECT state::text AS state, body->>'notes' AS notes, review_outcome"
    " FROM register_observations WHERE station_id = :station AND kind = 'SYNOP'"
    " AND observed_at = :at AND state NOT IN ('rejected', 'superseded')"
)


async def save(args: argparse.Namespace, reports: list[cl1_import.HourReport]) -> None:
    refuse_unless_local_register(args.allow_non_local)
    register = database.create_session()
    if register is None:
        raise SystemExit("EREGISTER_DATABASE_URL is not set.")
    created = updated = 0
    skipped: list[str] = []
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
        ready = sorted(
            (item for r in reports if (item := r.saveable()) is not None),
            key=lambda item: item[0],
        )
        for observed_at, workbook, row in ready:
            when = f"{observed_at:%Y-%m-%d %H:%M} UTC (sheet row {row})"
            live = (
                (
                    await register.execute(
                        _LIVE_ROW,
                        {"station": cl1_import.STATION_ID, "at": observed_at},
                    )
                )
                .mappings()
                .first()
            )
            if live is not None and not cl1_import.may_update(
                live["state"], live["notes"], live["review_outcome"]
            ):
                skipped.append(f"{when}: already there as {live['state']}")
                continue
            data = RegisterObservationCreate(
                station_id=cl1_import.STATION_ID,
                kind="SYNOP",
                observed_at=observed_at,
                body=workbook.model_dump(exclude_none=True),
            )
            try:
                _row, was_created = await entries.create(
                    register=register, app_session=app_session, data=data, user=actor
                )
            except AppException as exc:
                if exc.status_code == HTTP_CONFLICT:
                    skipped.append(f"{when}: already there (another entry)")
                else:
                    failed.append(f"{when}: {exc.message}")
            except HTTPException as exc:
                failed.append(f"{when}: {exc.detail}")
            else:
                created, updated = (
                    (created + 1, updated) if was_created else (created, updated + 1)
                )
    print(
        f"\nSaved as drafts: {created} new, {updated} refreshed (your earlier import, "
        f"unreviewed), {len(skipped)} left as they are, {len(failed)} refused."
    )
    for line in skipped:
        print(f"  left alone: {line}")
    for line in failed:
        print(f"  refused: {line}")
    if failed:
        raise SystemExit(1)


async def run(args: argparse.Namespace, rows: list[tuple[int, list[str]]]) -> None:
    register = database.create_session()
    amounts = None
    if register is not None:
        async with register:
            amounts = await stations.pressure_for(register, cl1_import.STATION_ID)
    if amounts is None:
        print(
            "Note: the station's pressure amounts are not available, so the sheet's dew point and humidity are not cross-checked.\n"
        )
    reports = cl1_import.check_sheet(
        rows, amounts, utc_offset_hours=args.utc_offset_hours
    )
    summary(reports)
    if args.report:
        write_report(Path(args.report), reports)
    if args.apply:
        await save(args, reports)
    else:
        print(
            "\nPreview only: nothing was saved. Add --apply to save the passing hours as drafts."
        )
    await database.close_engine()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--csv", required=True, help="The hourly sheet saved as CSV")
    parser.add_argument(
        "--utc-offset-hours", type=int, default=cl1_import.UTC_OFFSET_HOURS
    )
    parser.add_argument(
        "--report",
        help="Write every issue to this CSV file (keep it out of the repository)",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Save the passing hours as drafts"
    )
    parser.add_argument(
        "--actor", default="admin", help="Username recorded as the one who saved them"
    )
    parser.add_argument(
        "--allow-non-local",
        action="store_true",
        help="Needed outside ENVIRONMENT=local (owner go only)",
    )
    args = parser.parse_args()
    try:
        rows = cl1_import.read_sheet(Path(args.csv).read_text(encoding="utf-8-sig"))
    except (OSError, cl1_import.Cl1FormatError) as exc:
        raise SystemExit(f"Cannot read {args.csv}: {exc}") from exc
    asyncio.run(run(args, rows))


if __name__ == "__main__":
    main()
