"""Grid roster import — department-scoped name matching, blocking on unmatched
names, permission gating, and successful import into a draft period."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.exceptions import HRValidationError
from src.hr.roster.models import ShiftCategory
from src.hr.roster.schemas import RosterGridImportRequest, ShiftCatalogCreate
from src.hr.roster.service import (
    create_shift,
    import_roster_grid,
    validate_roster_grid,
)
from tests.factories import make_department, make_employee, make_user

JULY_START = date(2026, 7, 1)
JULY_END = date(2026, 7, 31)


async def _seed_shifts(session: AsyncSession, actor) -> None:
    for code in ("M", "N"):
        await create_shift(
            session=session,
            current_user=actor,
            shift_in=ShiftCatalogCreate(
                code=code, label=code, category=ShiftCategory.WORK
            ),
        )


def _req(dept_id: str, csv_text: str, *, publish: bool = False):
    return RosterGridImportRequest(
        department_id=dept_id,
        period_start=JULY_START,
        period_end=JULY_END,
        csv_text=csv_text,
        publish=publish,
    )


async def test_validate_reports_unmatched_names(db_async: AsyncSession) -> None:
    actor = await make_user(db_async, superuser=True)
    dept = await make_department(db_async, "dept_grid_a")
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=dept.id)
    await _seed_shifts(db_async, actor)

    csv_text = f"name,1,2\n{staff.username},M,N\nUnknown Person,M,\n"
    preview = await validate_roster_grid(
        session=db_async, current_user=actor, payload=_req(dept.id, csv_text)
    )
    assert preview.total_people == 2
    assert preview.matched_people == 1
    assert preview.unmatched_names == ["Unknown Person"]
    assert preview.can_import is False


async def test_import_blocked_when_unmatched(db_async: AsyncSession) -> None:
    actor = await make_user(db_async, superuser=True)
    dept = await make_department(db_async, "dept_grid_b")
    await _seed_shifts(db_async, actor)
    with pytest.raises(HRValidationError):
        await import_roster_grid(
            session=db_async,
            current_user=actor,
            payload=_req(dept.id, "name,1\nGhost,M\n"),
        )


async def test_import_success_into_draft_period(db_async: AsyncSession) -> None:
    actor = await make_user(db_async, superuser=True)
    dept = await make_department(db_async, "dept_grid_c")
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=dept.id)
    await _seed_shifts(db_async, actor)

    result = await import_roster_grid(
        session=db_async,
        current_user=actor,
        payload=_req(dept.id, f"name,1,2\n{staff.username},M,N\n"),
    )
    assert result.total_assignments == 2
    assert result.published is False  # imported as draft


async def test_matching_is_department_scoped(db_async: AsyncSession) -> None:
    actor = await make_user(db_async, superuser=True)
    dept_a = await make_department(db_async, "dept_grid_d")
    dept_b = await make_department(db_async, "dept_grid_e")
    outsider = await make_user(db_async)
    await make_employee(db_async, user=outsider, department_id=dept_b.id)
    await _seed_shifts(db_async, actor)

    # outsider belongs to dept_b, so importing for dept_a must NOT match them.
    preview = await validate_roster_grid(
        session=db_async,
        current_user=actor,
        payload=_req(dept_a.id, f"name,1\n{outsider.username},M\n"),
    )
    assert preview.matched_people == 0
    assert outsider.username in preview.unmatched_names


async def test_validate_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)  # plain user, no roster permission
    dept = await make_department(db_async, "dept_grid_f")
    with pytest.raises(AuthorizationError):
        await validate_roster_grid(
            session=db_async,
            current_user=user,
            payload=_req(dept.id, "name,1\nX,M\n"),
        )
