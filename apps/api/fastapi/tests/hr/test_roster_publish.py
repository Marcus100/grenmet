from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department
from src.hr.roster.models import (
    RosterRevision,
    RosterRevisionAction,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from tests.utils.utils import random_email, random_lower_string


async def test_publish_snapshots_full_assignments(db_async: AsyncSession) -> None:
    manager = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"pub_{random_lower_string()}",
            password="password123",
            first_name="Roster",
            last_name="Manager",
            is_superuser=True,
        ),
    )
    if not await db_async.get(Department, "dept_pub"):
        db_async.add(Department(id="dept_pub", name="Dept Publish"))
    for code, start, end, ends_next_day in (
        ("M", "05:30", "14:00", False),
        ("N", "22:30", "06:00", True),
    ):
        if not await db_async.get(ShiftCatalog, code):
            db_async.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=ShiftCategory.WORK,
                    start_time=start,
                    end_time=end,
                    ends_next_day=ends_next_day,
                )
            )
    await db_async.commit()

    period = await create_roster_period(
        session=db_async,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id="dept_pub",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db_async,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 7, 1),
                    shift_code="N",
                ),
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 7, 2),
                    shift_code="M",
                    remarks="training",
                ),
            ],
        ),
    )

    await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )

    result = await db_async.execute(
        select(RosterRevision).where(
            RosterRevision.roster_period_id == period.id,
            RosterRevision.action == RosterRevisionAction.PUBLISHED,
        )
    )
    revision = result.scalars().one()
    snapshot = revision.snapshot
    assert snapshot["assignment_count"] == 2
    assert snapshot["assignments"] == [
        {
            "user_id": str(manager.id),
            "assignment_date": "2026-07-01",
            "shift_code": "N",
            "remarks": None,
        },
        {
            "user_id": str(manager.id),
            "assignment_date": "2026-07-02",
            "shift_code": "M",
            "remarks": "training",
        },
    ]
