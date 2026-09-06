"""Import a roster from the converter's JSON interchange file.

Consumes the output of `scripts/gms-roster/pdf_to_json.py`. Unlike the CSV
importer this does no name guessing: the JSON already carries a resolved
`username` per person, validated against the department profile at conversion
time. Identity is decided once, by a human reviewing the conversion, rather than
re-derived by a heuristic on every import.

Rosters land as DRAFT for review; publishing stays a deliberate, separate act.

Usage (from apps/api/fastapi):

    uv run --frozen --package fast-back python scripts/import_roster_json.py \
        --json out/2026-09.json --dry-run
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import date
from pathlib import Path

from sqlmodel import col, select

from src.auth.models import User
from src.database import async_session_factory
from src.hr.models import EmploymentRecord
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterPeriod, ShiftCatalog
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

SUPPORTED_SCHEMA = "gms.roster.v1"


async def run(doc: dict, actor_name: str, dry_run: bool) -> int:
    if doc.get("schema_version") != SUPPORTED_SCHEMA:
        logger.error(
            "unsupported schema_version %r (expected %r)",
            doc.get("schema_version"),
            SUPPORTED_SCHEMA,
        )
        return 1
    if doc["validation"]["status"] != "ok":
        failed = [
            c["id"] for c in doc["validation"]["checks"] if c["status"] == "block"
        ]
        logger.error(
            "conversion is %s; blocked on %s", doc["validation"]["status"], failed
        )
        return 1

    department_id = doc["department"]["code"].lower()
    period_start = date.fromisoformat(doc["period"]["start"])
    period_end = date.fromisoformat(doc["period"]["end"])

    async with async_session_factory() as session:
        actor = (
            (
                await session.execute(
                    select(User).where(col(User.username) == actor_name)
                )
            )
            .scalars()
            .first()
        )
        if actor is None or not actor.is_superuser:
            logger.error("superuser %r not found", actor_name)
            return 1

        catalog = (
            (
                await session.execute(
                    select(ShiftCatalog).where(col(ShiftCatalog.is_active).is_(True))
                )
            )
            .scalars()
            .all()
        )
        valid_codes = {s.code for s in catalog}

        usernames = [p["username"] for p in doc["people"] if p.get("username")]
        users = (
            (
                await session.execute(
                    select(User).where(col(User.username).in_(usernames))
                )
            )
            .scalars()
            .all()
        )
        by_username = {u.username: u for u in users}

        members = {
            r.user_id
            for r in (
                await session.execute(
                    select(EmploymentRecord).where(
                        col(EmploymentRecord.department_id) == department_id
                    )
                )
            )
            .scalars()
            .all()
        }

        assignments: list[RosterAssignmentInput] = []
        errors: list[str] = []
        for person in doc["people"]:
            username = person.get("username")
            user = by_username.get(username) if username else None
            if user is None:
                errors.append(f"{person['roster_name']}: no account for {username!r}")
                continue
            if user.id not in members:
                errors.append(
                    f"{username}: not a member of department {department_id!r}"
                )
                continue
            for day, code in person["assignments"].items():
                if code not in valid_codes:
                    errors.append(f"{username} day {day}: unknown code {code!r}")
                    continue
                assignments.append(
                    RosterAssignmentInput(
                        user_id=user.id,
                        assignment_date=date(
                            period_start.year, period_start.month, int(day)
                        ),
                        shift_code=code,
                    )
                )

        if errors:
            for error in errors:
                logger.error("ERROR: %s", error)
            logger.error("%d problem(s); nothing imported", len(errors))
            return 1

        logger.info(
            "%s %s: %d people, %d assignments (source %s)",
            department_id,
            doc["period"]["month"],
            len(doc["people"]),
            len(assignments),
            doc["source"]["filename"],
        )
        if doc["source"].get("overflow_discarded"):
            logger.warning("note: codes past the end of the month were discarded")
        if dry_run:
            logger.info("Dry run — no changes made")
            return 0

        period = (
            (
                await session.execute(
                    select(RosterPeriod).where(
                        col(RosterPeriod.department_id) == department_id,
                        col(RosterPeriod.period_start) == period_start,
                    )
                )
            )
            .scalars()
            .first()
        )
        if period:
            logger.info("Reusing period %s (%s)", period.id, period.status)
        else:
            period = await roster_service.create_roster_period(
                session=session,
                current_user=actor,
                period_in=RosterPeriodCreate(
                    department_id=department_id,
                    period_start=period_start,
                    period_end=period_end,
                ),
            )
            logger.info("Created DRAFT period %s", period.id)

        await roster_service.bulk_upsert_roster_assignments(
            session=session,
            current_user=actor,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id, assignments=assignments
            ),
        )
        logger.info("Upserted %d assignments", len(assignments))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, required=True)
    parser.add_argument("--actor", default="admin")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.json.is_file():
        logger.error("no such file: %s", args.json)
        return 1
    return asyncio.run(run(json.loads(args.json.read_text()), args.actor, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
