"""Import the signed July 2026 Met Office duty roster (source: July 2026.pdf).

Creates (or reuses) the July 2026 roster period for dept_met, bulk-upserts
every assignment from the signed paper roster, and publishes the period so
the full snapshot is recorded as the plan of record.

Idempotent: re-running replaces the same user+date cells and skips
re-publishing a published period.

Run inside the api container:
    uv run python scripts/import_july_2026_roster.py
"""

import asyncio
from datetime import date, timedelta

from sqlmodel import col, select

from src.auth.models import User
from src.database import async_session_factory
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterPeriod, RosterPeriodStatus
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)

DEPARTMENT_ID = "dept_met"
PERIOD_START = date(2026, 7, 1)
PERIOD_END = date(2026, 7, 31)

# username -> codes for July 1..31 (transcribed from the signed roster).
# G. Tamar (manager) appears on the paper roster with no shift assignments.
ROWS: dict[str, str] = {
    "acharles": "NOOMENOOMENOOMENOOMENOOMENOOMEN",
    "vcyrus": "ENOOMENOOMENOOMENOOMENOOMENOOME",
    "ffrank": "MENOOLEN" + "V" * 23,
    "kjohnson": "V" * 31,
    "njones": "L" * 31,
    "tmiller": "OMENOOMENOOMENOOMENOOMENOOMENOO",
    "jpryce": "OOMENOOMENOOMENOOMENOOMENOOMENO",
    "ewhint": "L" * 15 + "MENOOMENOOMENOOM",
    "dbedeau": "VVVVVVVDDDOODDDDDOODDDDDOODDDDD",
    "kclarke": "NOOMENOOMENOOMENOOMENOOMENOOMEN",
    "scummings": "OMENOODDDDOODDDDDOODDDDDOODDDDD",
    "jfleming": "VVVVVVMENOOMENOOMENOOMENOOMENOO",
    "zbarry": "ENOOMMEOOMEEOOMEEOOMENOOMENOOME",
    "gcharles": "DDDOOMMEOOMMEOOMMEOOMEEOOMEEOOM",
    "tmitchell": "OMEOOENOOMENOOMENOODDDDDOODDDDD",
    "tteka": "MEEOODDDDDOODDVVVVVVVVMEEOOMEEO",
    "jmcleod": "MENOOMENOOMENOOMENOOMENOOMENOOM",
    "spaterson": "OOMENOOMENOOMENOOMENOOMENOOMENO",
    "tclovey": "OMENONOOMENOOMENOOMENOOMENOOMEN",
    "dwilliams": "NOOMEOOENOOMENOOMENOOMENOOMENOO",
}

VALID_CODES = set("MDENOLVS")


async def main() -> None:
    for username, codes in ROWS.items():
        if len(codes) != 31:
            raise SystemExit(f"{username}: expected 31 codes, got {len(codes)}")
        if invalid := set(codes) - VALID_CODES:
            raise SystemExit(f"{username}: invalid codes {invalid}")

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(col(User.username) == "admin")
        )
        admin = result.scalars().first()
        if not admin or not admin.is_superuser:
            raise SystemExit("Superuser 'admin' not found")

        user_result = await session.execute(
            select(User).where(col(User.username).in_(list(ROWS.keys())))
        )
        users_by_name = {u.username: u for u in user_result.scalars().all()}
        if missing := set(ROWS) - set(users_by_name):
            raise SystemExit(f"Missing users: {sorted(missing)}")

        period_result = await session.execute(
            select(RosterPeriod).where(
                col(RosterPeriod.department_id) == DEPARTMENT_ID,
                col(RosterPeriod.period_start) == PERIOD_START,
            )
        )
        period = period_result.scalars().first()
        if period:
            print(f"Reusing period {period.id} ({period.status})")
        else:
            period = await roster_service.create_roster_period(
                session=session,
                current_user=admin,
                period_in=RosterPeriodCreate(
                    department_id=DEPARTMENT_ID,
                    period_start=PERIOD_START,
                    period_end=PERIOD_END,
                ),
            )
            print(f"Created period {period.id}")

        assignments = [
            RosterAssignmentInput(
                user_id=users_by_name[username].id,
                assignment_date=PERIOD_START + timedelta(days=day_index),
                shift_code=code,
            )
            for username, codes in ROWS.items()
            for day_index, code in enumerate(codes)
        ]
        await roster_service.bulk_upsert_roster_assignments(
            session=session,
            current_user=admin,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id, assignments=assignments
            ),
        )
        print(f"Upserted {len(assignments)} assignments")

        if period.status == RosterPeriodStatus.DRAFT:
            await roster_service.publish_roster_period(
                session=session, current_user=admin, period_id=period.id
            )
            print("Period published (signed snapshot recorded)")
        else:
            print(f"Period already {period.status}; not re-publishing")


if __name__ == "__main__":
    asyncio.run(main())
