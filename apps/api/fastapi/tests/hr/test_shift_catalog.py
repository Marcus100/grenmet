"""Shift catalog service tests — permission gating, category-derived flag
defaults, advanced overrides, duplicate rejection, and deactivate."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AuthorizationError, NotFoundError
from src.hr.exceptions import HRValidationError
from src.hr.roster.models import ShiftCategory
from src.hr.roster.schemas import ShiftCatalogCreate, ShiftCatalogUpdate
from src.hr.roster.service import create_shift, read_shift_catalog, update_shift
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.utils.utils import random_email, random_lower_string


async def _superuser(db_async: AsyncSession) -> User:
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"shift_{random_lower_string()}",
            password="password123",
            first_name="Shift",
            last_name="Manager",
            is_superuser=True,
        ),
    )


async def test_create_shift_requires_roster_manage(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await create_shift(
            session=db_async,
            current_user=user,
            shift_in=ShiftCatalogCreate(
                code="X1", label="X", category=ShiftCategory.WORK
            ),
        )


async def test_create_shift_with_roster_manage_permission(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "roster.manage")
    await assign_role(db_async, user=user, role=role)

    shift = await create_shift(
        session=db_async,
        current_user=user,
        shift_in=ShiftCatalogCreate(
            code="P1", label="Perm", category=ShiftCategory.OFF
        ),
    )
    assert shift.code == "P1"


async def test_create_shift_derives_flags_from_category(db_async: AsyncSession) -> None:
    manager = await _superuser(db_async)

    work = await create_shift(
        session=db_async,
        current_user=manager,
        shift_in=ShiftCatalogCreate(
            code="M1",
            label="Morning",
            category=ShiftCategory.WORK,
            start_time="05:30",
            end_time="14:00",
        ),
    )
    assert work.counts_as_work_hours is True
    assert work.needs_reason is False
    assert work.needs_approval is False

    leave = await create_shift(
        session=db_async,
        current_user=manager,
        shift_in=ShiftCatalogCreate(
            code="L1", label="Leave", category=ShiftCategory.LEAVE
        ),
    )
    assert leave.counts_as_work_hours is False
    assert leave.needs_reason is True
    assert leave.needs_approval is True


async def test_create_shift_advanced_override_wins(db_async: AsyncSession) -> None:
    manager = await _superuser(db_async)
    shift = await create_shift(
        session=db_async,
        current_user=manager,
        shift_in=ShiftCatalogCreate(
            code="W2",
            label="Work, unpaid",
            category=ShiftCategory.WORK,
            counts_as_work_hours=False,
        ),
    )
    # Explicit override beats the category default (WORK would default True).
    assert shift.counts_as_work_hours is False


async def test_create_shift_duplicate_code_rejected(db_async: AsyncSession) -> None:
    manager = await _superuser(db_async)
    payload = ShiftCatalogCreate(code="D9", label="Dup", category=ShiftCategory.OFF)
    await create_shift(session=db_async, current_user=manager, shift_in=payload)
    with pytest.raises(HRValidationError):
        await create_shift(session=db_async, current_user=manager, shift_in=payload)


async def test_deactivate_hides_from_active_list_only(db_async: AsyncSession) -> None:
    manager = await _superuser(db_async)
    await create_shift(
        session=db_async,
        current_user=manager,
        shift_in=ShiftCatalogCreate(
            code="Z9", label="Temp", category=ShiftCategory.OFF
        ),
    )

    updated = await update_shift(
        session=db_async,
        current_user=manager,
        code="Z9",
        shift_in=ShiftCatalogUpdate(is_active=False),
    )
    assert updated.is_active is False

    active = await read_shift_catalog(session=db_async, current_user=manager)
    assert all(s.code != "Z9" for s in active)

    all_shifts = await read_shift_catalog(
        session=db_async, current_user=manager, include_inactive=True
    )
    assert any(s.code == "Z9" for s in all_shifts)


async def test_update_shift_not_found(db_async: AsyncSession) -> None:
    manager = await _superuser(db_async)
    with pytest.raises(NotFoundError):
        await update_shift(
            session=db_async,
            current_user=manager,
            code="NOPE",
            shift_in=ShiftCatalogUpdate(label="X"),
        )
