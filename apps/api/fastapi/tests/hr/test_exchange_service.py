"""Shift-swap (exchange) service tests — permission requirement and create flow."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.exchange.schemas import ShiftSwapRequestCreate
from src.hr.exchange.service import create_shift_swap_request
from src.hr.models import RequestStatus
from src.hr.workflow.models import WorkflowType
from tests.factories import (
    assign_role,
    make_department,
    make_ready_staff,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)


def _payload(counterpart_id, department_id) -> ShiftSwapRequestCreate:
    return ShiftSwapRequestCreate(
        counterpart_user_id=counterpart_id,
        department_id=department_id,
        source_date=date(2026, 7, 1),
        source_shift_code="D",
        target_date=date(2026, 7, 2),
        target_shift_code="N",
    )


async def test_create_shift_swap_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    counterpart = await make_user(db_async)
    dept = await make_department(db_async, "dept_swap_perm")

    with pytest.raises(AuthorizationError):
        await create_shift_swap_request(
            session=db_async,
            current_user=user,
            payload=_payload(counterpart.id, dept.id),
        )


async def test_create_shift_swap_with_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    counterpart = await make_user(db_async)
    dept = await make_department(db_async, "dept_swap_ok")
    role, _ = await make_role_with_permission(
        db_async, "shift_swap.request.create.self"
    )
    await assign_role(db_async, user=user, role=role)

    await make_submission_setup(db_async, user, dept.id, WorkflowType.SHIFT_SWAP)
    await make_ready_staff(db_async, counterpart, dept.id)
    await roster_for_exchange(db_async, user, counterpart, dept.id)

    request = await create_shift_swap_request(
        session=db_async,
        current_user=user,
        payload=_payload(counterpart.id, dept.id),
    )

    assert request.requesting_user_id == user.id
    assert request.counterpart_user_id == counterpart.id
    assert request.status == RequestStatus.SUBMITTED


async def roster_for_exchange(session, user, counterpart, department_id):
    from src.hr.roster.models import (
        RosterAssignment,
        RosterPeriod,
        RosterPeriodStatus,
        ShiftCatalog,
        ShiftCategory,
    )

    for code in ("D", "M", "E", "N", "O"):
        if await session.get(ShiftCatalog, code) is None:
            session.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=ShiftCategory.OFF if code == "O" else ShiftCategory.WORK,
                    start_time="22:30" if code == "N" else "08:00",
                    end_time="06:00" if code == "N" else "16:00",
                    ends_next_day=code == "N",
                )
            )
    await session.flush()

    period = RosterPeriod(
        department_id=department_id,
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 31),
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=user.id,
    )
    session.add(period)
    await session.flush()
    rows = [
        RosterAssignment(
            roster_period_id=period.id,
            user_id=person.id,
            assignment_date=day,
            shift_code=code,
        )
        for person, day, code in [
            (user, date(2026, 7, 1), "D"),
            (counterpart, date(2026, 7, 1), "O"),
            (user, date(2026, 7, 2), "O"),
            (counterpart, date(2026, 7, 2), "N"),
        ]
    ]
    session.add_all(rows)
    await session.commit()
    return rows
