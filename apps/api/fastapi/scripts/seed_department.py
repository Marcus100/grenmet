"""Add missing department membership from a verified profile; preview by default.

Existing grades, employment details and reporting assignments are authoritative.
This command creates no accounts, personnel numbers, employment dates or grants.
"""

import argparse
import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import text
from sqlmodel import col, select

from src.auth.models import User
from src.baseline.department import GMS_DEPARTMENT_IDS
from src.config import settings
from src.database import async_session_factory
from src.hr.models import Department, EmploymentRecord, Grade

logger = logging.getLogger(__name__)


async def run(profile: dict, dry_run: bool = True) -> int:
    code = profile["department"]["code"].upper()
    department_id = code.lower()
    name = profile["department"]["name"]
    grades = {grade["code"]: grade for grade in profile["grades"]}
    people = profile["people"]
    usernames = [person["username"] for person in people]
    if len(set(usernames)) != len(usernames) or any(
        person["grade"] not in grades for person in people
    ):
        raise ValueError("Profile contains duplicate usernames or unknown grades")
    async with async_session_factory() as session:
        await session.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
        departments = (await session.execute(select(Department))).scalars().all()
        if any(
            d.id == department_id and d.organisation_id != "gaa" for d in departments
        ):
            raise ValueError("GAA department ID belongs to another organisation")
        departments = [d for d in departments if d.organisation_id == "gaa"]
        matches = [
            d
            for d in departments
            if d.id == department_id
            or d.name == name
            or (code == "GMS" and d.id in GMS_DEPARTMENT_IDS)
        ]
        if len(matches) > 1:
            raise ValueError(
                "Ambiguous department identity; reconcile before importing"
            )
        if matches:
            department_id = matches[0].id
        users = (
            (
                await session.execute(
                    select(User).where(col(User.username).in_(usernames))
                )
            )
            .scalars()
            .all()
        )
        by_username = {user.username: user for user in users}
        if set(usernames) - by_username.keys():
            raise ValueError(
                "Create verified accounts before importing department membership"
            )
        changes = []
        if not matches:
            changes.append(f"Create department {department_id}")
            session.add(
                Department(
                    organisation_id="gaa",
                    code=department_id,
                    id=department_id,
                    name=name,
                )
            )
            await session.flush()
        for grade_code, spec in grades.items():
            grade_id = f"{code}_{grade_code}"
            existing = await session.get(Grade, grade_id)
            if existing:
                if (
                    existing.department_id != department_id
                    or existing.code != grade_code
                    or not existing.is_active
                ):
                    raise ValueError(
                        f"Grade identity or activation conflict: {grade_id}"
                    )
                continue
            changes.append(f"Create grade {grade_id}")
            session.add(Grade(id=grade_id, department_id=department_id, **spec))
        await session.flush()
        for person in people:
            user = by_username[person["username"]]
            existing = (
                (
                    await session.execute(
                        select(EmploymentRecord).where(
                            EmploymentRecord.user_id == user.id
                        )
                    )
                )
                .scalars()
                .first()
            )
            if existing:
                if existing.department_id != department_id:
                    raise ValueError(f"Department conflict for {user.username}")
                continue
            changes.append(f"Create incomplete employment record for {user.username}")
            session.add(
                EmploymentRecord(
                    organisation_id="gaa",
                    user_id=user.id,
                    department_id=department_id,
                    grade_id=f"{code}_{person['grade']}",
                    position=grades[person["grade"]]["label"],
                    roster_name=person.get("roster_name"),
                    employee_number=None,
                    employment_type=None,
                    start_date=None,
                    supervisor_id=None,
                )
            )
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
        print(
            json.dumps(
                {
                    "environment": settings.ENVIRONMENT,
                    "database": settings.POSTGRES_DB,
                    "applied": not dry_run,
                    "changes": changes,
                }
            )
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument(
        "--environment", required=True, choices=("local", "staging", "production")
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--dry-run", action="store_true", help="Preview (the default)")
    args = parser.parse_args()
    if args.environment != settings.ENVIRONMENT:
        parser.error("Requested environment does not match configured environment")
    return asyncio.run(
        run(json.loads(args.profile.read_text()), dry_run=not args.apply)
    )


if __name__ == "__main__":
    raise SystemExit(main())
