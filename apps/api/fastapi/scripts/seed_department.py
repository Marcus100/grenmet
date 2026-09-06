"""Create a department and its employment records from a roster profile.

Idempotent groundwork: a roster cannot import until a department exists and every
person has an employment record placing them in it -- the grid importer resolves
names against department members only, so with no employment records it matches
nobody.

Driven entirely by the department profile used by the roster converter
(`scripts/gms-roster/profiles/<code>.json`), so the two can never disagree about
who is in the department or what grade they hold. A second department is a second
profile; this script does not change.

Usage (from apps/api/fastapi):

    uv run --frozen --package fast-back python scripts/seed_department.py \
        --profile ../../../scripts/gms-roster/profiles/gms.json --dry-run
    uv run --frozen --package fast-back python scripts/seed_department.py \
        --profile ../../../scripts/gms-roster/profiles/gms.json
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from sqlmodel import col, select

from src.auth.models import User
from src.database import async_session_factory
from src.hr.models import (
    Department,
    EmploymentRecord,
    EmploymentStatus,
    EmploymentType,
    Grade,
)
from src.utils.datetime import utc_now

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

MANAGER_GRADE = "MANAGER"


async def run(profile: dict, dry_run: bool) -> int:
    dept_code = profile["department"]["code"]
    dept_id = dept_code.lower()
    dept_name = profile["department"]["name"]
    grades = {g["code"]: g for g in profile["grades"]}
    people = profile["people"]

    def grade_id(code: str) -> str:
        return f"{dept_code}_{code}"

    async with async_session_factory() as session:
        department = await session.get(Department, dept_id)
        if department is None:
            logger.info("CREATE department %s (%s)", dept_id, dept_name)
            if not dry_run:
                session.add(Department(id=dept_id, name=dept_name))
                await session.flush()
        else:
            logger.info("EXISTS department %s (%s)", dept_id, department.name)

        for spec in profile["grades"]:
            gid = grade_id(spec["code"])
            grade = await session.get(Grade, gid)
            if grade is None:
                logger.info("CREATE grade %-28s rank=%d", gid, spec["rank"])
                if not dry_run:
                    session.add(
                        Grade(
                            id=gid,
                            department_id=dept_id,
                            code=spec["code"],
                            label=spec["label"],
                            rank=spec["rank"],
                            establishment_band=spec.get("establishment_band"),
                        )
                    )
            else:
                # The profile is the source of truth for band metadata; keep an
                # existing row in step with it rather than leaving it stale.
                grade.label = spec["label"]
                grade.rank = spec["rank"]
                grade.establishment_band = spec.get("establishment_band")
                grade.updated_at = utc_now()
                logger.info("UPDATE grade %-28s rank=%d", gid, spec["rank"])
        if not dry_run:
            await session.flush()

        usernames = [p["username"] for p in people]
        result = await session.execute(
            select(User).where(col(User.username).in_(usernames))
        )
        by_username = {u.username: u for u in result.scalars().all()}

        missing = [u for u in usernames if u not in by_username]
        if missing:
            logger.error("ABORT: no user account for %s", missing)
            return 1

        manager = next(
            (by_username[p["username"]] for p in people if p["grade"] == MANAGER_GRADE),
            None,
        )
        if manager is None:
            logger.warning("no %s in profile; supervisor left unset", MANAGER_GRADE)

        created = updated = unchanged = 0
        for index, person in enumerate(people, start=1):
            user = by_username[person["username"]]
            spec = grades.get(person["grade"])
            position = spec["label"] if spec else person["grade"]
            gid = grade_id(person["grade"]) if spec else None
            roster_name = person.get("roster_name")

            existing = await session.execute(
                select(EmploymentRecord).where(col(EmploymentRecord.user_id) == user.id)
            )
            employment = existing.scalars().first()
            if employment is not None:
                # Backfill: the grade band and roster name previously lived only
                # in the profile, so records seeded before them need filling in.
                changes = []
                if employment.grade_id != gid:
                    employment.grade_id = gid
                    changes.append(f"grade={gid}")
                if employment.roster_name != roster_name:
                    employment.roster_name = roster_name
                    changes.append(f"roster_name={roster_name!r}")
                if not changes:
                    unchanged += 1
                    continue
                employment.updated_at = utc_now()
                logger.info(
                    "UPDATE employment %-12s %s", person["username"], " ".join(changes)
                )
                updated += 1
                continue

            # Provisional until GAA supplies real personnel numbers. Stable and
            # deterministic: profile order, prefixed by department.
            employee_number = f"{dept_code}-{index:03d}"
            supervisor_id = (
                None if manager is None or user.id == manager.id else manager.id
            )
            logger.info(
                "CREATE employment %-12s %-10s %-26s supervisor=%s",
                person["username"],
                employee_number,
                position,
                "-" if supervisor_id is None else "manager",
            )
            if not dry_run:
                session.add(
                    EmploymentRecord(
                        user_id=user.id,
                        employee_number=employee_number,
                        department_id=dept_id,
                        grade_id=gid,
                        roster_name=roster_name,
                        position=position,
                        employment_type=EmploymentType.FULL_TIME,
                        status=EmploymentStatus.ACTIVE,
                        supervisor_id=supervisor_id,
                    )
                )
            created += 1

        summary = "created %d, updated %d, unchanged %d"
        if dry_run:
            await session.rollback()
            logger.info("\nDRY RUN: would " + summary, created, updated, unchanged)
        else:
            await session.commit()
            logger.info("\nDone: " + summary, created, updated, unchanged)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.profile.is_file():
        logger.error("no such profile: %s", args.profile)
        return 1
    profile = json.loads(args.profile.read_text())
    return asyncio.run(run(profile, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
