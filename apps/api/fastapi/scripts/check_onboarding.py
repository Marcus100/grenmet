"""Read-only onboarding preflight. Use --require-complete for acceptance gates."""

import argparse
import asyncio
import json

from sqlmodel import col, select

from src.auth.models import User
from src.baseline import catalogue
from src.baseline.department import GMS_DEPARTMENT_IDS
from src.config import settings
from src.database import async_session_factory
from src.hr.models import Department


async def check() -> bool:
    async with async_session_factory() as session:
        departments = (
            (
                await session.execute(
                    select(Department).where(col(Department.id).in_(GMS_DEPARTMENT_IDS))
                )
            )
            .scalars()
            .all()
        )
        actor = (
            (
                await session.execute(
                    select(User).where(
                        User.email == settings.FIRST_SUPERUSER,
                        col(User.is_superuser).is_(True),
                        col(User.is_active).is_(True),
                    )
                )
            )
            .scalars()
            .first()
        )
        if not departments or actor is None:
            print(
                json.dumps(
                    {
                        "onboarding_ready": False,
                        "reason": "Initial administrator or GMS department requires setup",
                    }
                )
            )
            return False
        previews = [
            await catalogue.preview(session, actor, department.id)
            for department in departments
        ]
        complete = len(departments) == 1 and all(
            not (
                p.missing_grade_ids
                or p.missing_policy_keys
                or p.missing_workflow_types
                or p.conflicts
            )
            for p in previews
        )
        print(
            json.dumps(
                {
                    "reference_data_ready": complete,
                    "departments": [p.model_dump() for p in previews],
                    "note": "Staff verification, role assignments, approver availability and provider connections require separate acceptance.",
                }
            )
        )
        return complete


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    ready = asyncio.run(check())
    raise SystemExit(1 if args.require_complete and not ready else 0)
