"""Shift-swap (exchange) service tests — permission requirement and create flow."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.exchange.schemas import ShiftSwapRequestCreate
from src.hr.exchange.service import create_shift_swap_request
from src.hr.models import RequestStatus
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
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
    role, _ = await make_role_with_permission(db_async, "shift_swap.request.create.self")
    await assign_role(db_async, user=user, role=role)

    request = await create_shift_swap_request(
        session=db_async,
        current_user=user,
        payload=_payload(counterpart.id, dept.id),
    )

    assert request.requesting_user_id == user.id
    assert request.counterpart_user_id == counterpart.id
    assert request.status == RequestStatus.SUBMITTED
