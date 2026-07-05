"""Import a monthly duty roster from a CSV grid into the roster module.

CSV format (exactly how a roster is typed up in Excel — one row per person,
one column per day of the month):

    name,1,2,3,...,31
    E. Whint,L,L,L,...,M
    kjohnson,V,V,V,...,V

- ``name`` may be a username (kjohnson) or the paper convention "F. Lastname"
  (case-insensitive; matched against first-name initial + last name).
- Blank cells are allowed (person not rostered that day — e.g. the manager).
- Codes are validated against the active shift catalog in the database.
- The roster period is created if missing, reused if present.

Usage (inside the api container):

    uv run python scripts/import_roster.py --month 2026-08 --csv scripts/data/roster_2026-08.csv
    uv run python scripts/import_roster.py --month 2026-07 --csv scripts/data/roster_2026-07.csv --publish
    uv run python scripts/import_roster.py --month 2026-08 --csv ... --dry-run
"""

import argparse
import asyncio
import calendar
import csv
import sys
from datetime import date
from pathlib import Path

from sqlmodel import col, select

from src.auth.models import User
from src.database import async_session_factory
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterPeriod, RosterPeriodStatus, ShiftCatalog
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)


def parse_month(value: str) -> tuple[date, date]:
    try:
        year_str, month_str = value.split("-")
        year, month = int(year_str), int(month_str)
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)
    except (ValueError, IndexError):
        raise argparse.ArgumentTypeError(
            f"--month must be YYYY-MM, got {value!r}"
        ) from None


def read_grid(csv_path: Path, days_in_month: int) -> dict[str, dict[int, str]]:
    """Parse the CSV into {name: {day: code}}, skipping blank cells."""
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if not header or header[0].strip().lower() != "name":
            raise SystemExit("CSV must start with a header row: name,1,2,...")
        day_columns: list[int] = []
        for cell in header[1:]:
            cell = cell.strip()
            if not cell:
                continue
            if not cell.isdigit() or not (1 <= int(cell) <= days_in_month):
                raise SystemExit(
                    f"Header day column {cell!r} is not a valid day of the month"
                )
            day_columns.append(int(cell))

        grid: dict[str, dict[int, str]] = {}
        for row_number, row in enumerate(reader, start=2):
            if not row or not row[0].strip():
                continue
            name = row[0].strip()
            codes: dict[int, str] = {}
            for day, cell in zip(day_columns, row[1:], strict=False):
                code = cell.strip().upper()
                if code:
                    codes[day] = code
            if name in grid:
                raise SystemExit(f"Duplicate row for {name!r} (line {row_number})")
            grid[name] = codes
        if not grid:
            raise SystemExit("CSV contains no roster rows")
        return grid


def resolve_user(name: str, users: list[User]) -> User | None:
    """Match a row name to a user by username, or paper-style 'F. Lastname'."""
    lowered = name.lower()
    for user in users:
        if user.username.lower() == lowered:
            return user
    compact = lowered.replace(".", "").replace(" ", "")
    matches = [
        user
        for user in users
        if user.first_name
        and user.last_name
        and f"{user.first_name[0]}{user.last_name}".lower().replace(" ", "") == compact
    ]
    return matches[0] if len(matches) == 1 else None


async def run(args: argparse.Namespace) -> None:
    period_start, period_end = args.month
    days_in_month = period_end.day
    grid = read_grid(Path(args.csv), days_in_month)

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(col(User.username) == args.actor)
        )
        actor = result.scalars().first()
        if not actor or not actor.is_superuser:
            raise SystemExit(f"Superuser {args.actor!r} not found")

        catalog_result = await session.execute(
            select(ShiftCatalog).where(col(ShiftCatalog.is_active) == True)  # noqa: E712
        )
        valid_codes = {shift.code for shift in catalog_result.scalars().all()}
        if not valid_codes:
            raise SystemExit("Shift catalog is empty — seed it first")

        users_result = await session.execute(select(User))
        users = list(users_result.scalars().all())

        assignments: list[RosterAssignmentInput] = []
        errors: list[str] = []
        for name, codes in grid.items():
            user = resolve_user(name, users)
            if not user:
                errors.append(f"Unknown or ambiguous name: {name!r}")
                continue
            for day, code in codes.items():
                if code not in valid_codes:
                    errors.append(f"{name} day {day}: unknown code {code!r}")
                    continue
                assignments.append(
                    RosterAssignmentInput(
                        user_id=user.id,
                        assignment_date=date(
                            period_start.year, period_start.month, day
                        ),
                        shift_code=code,
                    )
                )
        if errors:
            for error in errors:
                print(f"ERROR: {error}", file=sys.stderr)
            raise SystemExit(f"{len(errors)} problem(s) found; nothing imported")

        print(
            f"{len(grid)} people, {len(assignments)} assignments "
            f"for {period_start:%B %Y} ({args.department})"
        )
        if args.dry_run:
            print("Dry run — no changes made")
            return

        period_result = await session.execute(
            select(RosterPeriod).where(
                col(RosterPeriod.department_id) == args.department,
                col(RosterPeriod.period_start) == period_start,
            )
        )
        period = period_result.scalars().first()
        if period:
            print(f"Reusing period {period.id} ({period.status})")
        else:
            period = await roster_service.create_roster_period(
                session=session,
                current_user=actor,
                period_in=RosterPeriodCreate(
                    department_id=args.department,
                    period_start=period_start,
                    period_end=period_end,
                ),
            )
            print(f"Created period {period.id}")

        await roster_service.bulk_upsert_roster_assignments(
            session=session,
            current_user=actor,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id, assignments=assignments
            ),
        )
        print(f"Upserted {len(assignments)} assignments")

        if args.publish:
            if period.status == RosterPeriodStatus.DRAFT:
                await roster_service.publish_roster_period(
                    session=session, current_user=actor, period_id=period.id
                )
                print("Period published (signed snapshot recorded)")
            else:
                print(f"Period already {period.status}; not re-publishing")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True, type=parse_month, help="YYYY-MM")
    parser.add_argument("--csv", required=True, help="Path to the roster grid CSV")
    parser.add_argument("--department", default="dept_met")
    parser.add_argument(
        "--actor", default="admin", help="Superuser performing the import"
    )
    parser.add_argument("--publish", action="store_true", help="Publish after import")
    parser.add_argument("--dry-run", action="store_true", help="Validate only")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
