import pytest
from sqlmodel import select

from scripts.seed_department import run
from src.auth.models import User
from src.hr.models import Department, EmploymentRecord, Grade

PROFILE = {
    "department": {"code": "GMS", "name": "Meteorological Department"},
    "grades": [{"code": "MANAGER", "label": "Manager", "rank": 1}],
    "people": [
        {"username": "verified-person", "grade": "MANAGER", "roster_name": "Person"}
    ],
}


@pytest.mark.asyncio
async def test_department_seed_preserves_edits_and_does_not_invent_personnel(db_async):
    user = User(
        username="verified-person",
        email="person@example.com",
        first_name="Verified",
        last_name="Person",
        hashed_password="unused",
    )
    db_async.add_all(
        [
            user,
            Department(
                organisation_id="gaa",
                code="meteorological_department",
                id="meteorological_department",
                name="Meteorological Department",
            ),
        ]
    )
    await db_async.commit()
    await run(PROFILE, dry_run=True)
    assert not (await db_async.execute(select(Grade))).scalars().all()
    await run(PROFILE, dry_run=False)
    record = (
        (
            await db_async.execute(
                select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
            )
        )
        .scalars()
        .one()
    )
    assert record.department_id == "meteorological_department"
    assert (
        record.employee_number is None
        and record.employment_type is None
        and record.start_date is None
        and record.supervisor_id is None
    )
    grade = await db_async.get(Grade, "GMS_MANAGER")
    grade.label = "Verified online title"
    record.roster_name = "Edited online"
    await db_async.commit()
    await run(PROFILE, dry_run=False)
    await db_async.refresh(grade)
    await db_async.refresh(record)
    assert (
        grade.label == "Verified online title" and record.roster_name == "Edited online"
    )
    assert len((await db_async.execute(select(Department))).scalars().all()) == 1
