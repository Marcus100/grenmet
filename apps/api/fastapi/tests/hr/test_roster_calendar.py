"""The roster layer of the department calendar.

Covers what the calendar feed has to get right and the roster grid never had
to: a window that clips a period, a night shift that runs past midnight, codes
with no clock time, who may see whose shifts, and the fact that a DRAFT roster
is not yet the signed plan of record.
"""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.exceptions import HRValidationError
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    calendar_times,
    create_roster_period,
    publish_roster_period,
    read_roster_calendar,
)
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def _catalog(session: AsyncSession) -> None:
    for code, label, category, start, end, next_day in (
        ("M", "Morning", ShiftCategory.WORK, "05:30", "14:00", False),
        ("N", "Night", ShiftCategory.WORK, "22:30", "06:00", True),
        ("O", "Off Duty", ShiftCategory.OFF, None, None, False),
        ("V", "Vacation", ShiftCategory.LEAVE, None, None, False),
    ):
        if not await session.get(ShiftCatalog, code):
            session.add(
                ShiftCatalog(
                    code=code,
                    label=label,
                    category=category,
                    start_time=start,
                    end_time=end,
                    ends_next_day=next_day,
                )
            )
    await session.commit()


async def _rostered_department(session: AsyncSession, dept_id: str, *, publish: bool):
    """A manager, a colleague, and a published-or-draft July roster for both."""
    await _catalog(session)
    department = await make_department(session, dept_id)
    manager = await make_user(session, superuser=True)
    colleague = await make_user(session)
    await make_employee(session, user=manager, department_id=department.id)
    await make_employee(session, user=colleague, department_id=department.id)

    period = await create_roster_period(
        session=session,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=department.id,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=session,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 7, 6),
                    shift_code="N",
                ),
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 7, 7),
                    shift_code="O",
                ),
                RosterAssignmentInput(
                    user_id=colleague.id,
                    assignment_date=date(2026, 7, 6),
                    shift_code="V",
                ),
                RosterAssignmentInput(
                    user_id=colleague.id,
                    assignment_date=date(2026, 7, 20),
                    shift_code="M",
                ),
            ],
        ),
    )
    if publish:
        await publish_roster_period(
            session=session, current_user=manager, period_id=period.id
        )
    return department, manager, colleague


async def test_night_shift_ends_on_the_following_morning(
    db_async: AsyncSession,
) -> None:
    department, manager, _ = await _rostered_department(
        db_async, "cal_night", publish=True
    )

    rows = await read_roster_calendar(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 6),
        end=date(2026, 7, 6),
        department_id=department.id,
        department_scope=True,
    )
    night = next(r for r in rows if r[0].shift_code == "N")
    starts_at, ends_at = calendar_times(night[0], night[1])

    assert starts_at == "2026-07-06T22:30:00"
    assert ends_at == "2026-07-07T06:00:00"


async def test_codes_without_clock_times_have_no_interval(
    db_async: AsyncSession,
) -> None:
    department, manager, _ = await _rostered_department(
        db_async, "cal_allday", publish=True
    )

    rows = await read_roster_calendar(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 6),
        end=date(2026, 7, 6),
        department_id=department.id,
        department_scope=True,
    )
    vacation = next(r for r in rows if r[0].shift_code == "V")

    assert calendar_times(vacation[0], vacation[1]) == (None, None)


async def test_window_clips_assignments_outside_the_range(
    db_async: AsyncSession,
) -> None:
    department, manager, _ = await _rostered_department(
        db_async, "cal_clip", publish=True
    )

    rows = await read_roster_calendar(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 1),
        end=date(2026, 7, 10),
        department_id=department.id,
        department_scope=True,
    )

    dates = {row[0].assignment_date for row in rows}
    assert dates == {date(2026, 7, 6), date(2026, 7, 7)}


async def test_self_scope_returns_only_the_callers_own_shifts(
    db_async: AsyncSession,
) -> None:
    _, _, colleague = await _rostered_department(db_async, "cal_scope", publish=True)

    rows = await read_roster_calendar(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 1),
        end=date(2026, 7, 31),
    )

    assert {row[0].user_id for row in rows} == {colleague.id}


async def test_draft_rosters_are_hidden_from_staff_and_flagged_for_managers(
    db_async: AsyncSession,
) -> None:
    department, manager, colleague = await _rostered_department(
        db_async, "cal_draft", publish=False
    )
    role, _ = await make_role_with_permission(db_async, "roster.view")
    await assign_role(db_async, user=colleague, role=role)

    staff_rows = await read_roster_calendar(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 1),
        end=date(2026, 7, 31),
    )
    assert staff_rows == []

    manager_rows = await read_roster_calendar(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 1),
        end=date(2026, 7, 31),
        department_id=department.id,
        department_scope=True,
    )
    assert manager_rows
    assert all(row[4] is True for row in manager_rows)


async def test_department_scope_requires_roster_view(
    db_async: AsyncSession,
) -> None:
    department, _, colleague = await _rostered_department(
        db_async, "cal_perm", publish=True
    )

    with pytest.raises(Exception) as excinfo:
        await read_roster_calendar(
            session=db_async,
            current_user=colleague,
            start=date(2026, 7, 1),
            end=date(2026, 7, 31),
            department_id=department.id,
            department_scope=True,
        )
    assert "permission" in str(excinfo.value).lower()


async def test_range_is_validated_and_capped(db_async: AsyncSession) -> None:
    _, manager, _ = await _rostered_department(db_async, "cal_range", publish=True)

    with pytest.raises(HRValidationError):
        await read_roster_calendar(
            session=db_async,
            current_user=manager,
            start=date(2026, 7, 10),
            end=date(2026, 7, 1),
        )

    with pytest.raises(HRValidationError):
        await read_roster_calendar(
            session=db_async,
            current_user=manager,
            start=date(2026, 1, 1),
            end=date(2026, 12, 31),
        )
