"""Daily status-report service tests — permission requirement and create + entries."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.dailystatus.models import PersonnelStatus
from src.hr.dailystatus.schemas import StatusReportCreate, StatusReportEntryInput
from src.hr.dailystatus.service import create_status_report
from src.hr.models import RequestStatus
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)


async def test_create_status_report_requires_permission(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_status_perm")

    with pytest.raises(AuthorizationError):
        await create_status_report(
            session=db_async,
            current_user=user,
            payload=StatusReportCreate(
                department_id=dept.id,
                report_date=date(2026, 7, 1),
                shift_code="D",
            ),
        )


async def test_create_status_report_with_entries(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_status_ok")
    role, _ = await make_role_with_permission(db_async, "status.report.create")
    await assign_role(db_async, user=user, role=role)

    report, entries = await create_status_report(
        session=db_async,
        current_user=user,
        payload=StatusReportCreate(
            department_id=dept.id,
            report_date=date(2026, 7, 1),
            shift_code="D",
            general_remarks="All nominal",
            entries=[
                StatusReportEntryInput(
                    user_id=user.id, personnel_status=PersonnelStatus.PRESENT
                )
            ],
        ),
    )

    assert report.submitted_by_user_id == user.id
    assert report.status == RequestStatus.SUBMITTED
    assert len(entries) == 1
    assert entries[0].user_id == user.id
    # Entry fields are usable without a per-row refresh (Slice 7 change): the
    # Python-side id/status are populated straight from the model construction.
    assert entries[0].id is not None
    assert entries[0].personnel_status == PersonnelStatus.PRESENT
