"""Absentee service tests — reason enum and conditional-notes rule."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.absentee.models import AbsenceReason
from src.hr.absentee.schemas import AbsenteeReportCreate
from src.hr.absentee.service import create_absentee_report
from src.hr.exceptions import HRValidationError
from src.hr.models import RequestStatus
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)


async def _user_with_create_perm(db_async: AsyncSession):
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "absentee.report.create")
    await assign_role(db_async, user=user, role=role)
    return user


def _payload(user_id, department_id, reason, notes=None) -> AbsenteeReportCreate:
    return AbsenteeReportCreate(
        user_id=user_id,
        department_id=department_id,
        report_date=date(2026, 7, 1),
        reason=reason,
        notes=notes,
    )


async def test_uncertified_sick_requires_notes(db_async: AsyncSession) -> None:
    user = await _user_with_create_perm(db_async)
    dept = await make_department(db_async, "dept_abs_notes")

    with pytest.raises(HRValidationError):
        await create_absentee_report(
            session=db_async,
            current_user=user,
            payload=_payload(user.id, dept.id, AbsenceReason.UNCERTIFIED_SICK),
        )


async def test_uncertified_sick_with_notes_succeeds(db_async: AsyncSession) -> None:
    user = await _user_with_create_perm(db_async)
    dept = await make_department(db_async, "dept_abs_ok")

    report = await create_absentee_report(
        session=db_async,
        current_user=user,
        payload=_payload(
            user.id, dept.id, AbsenceReason.ILLNESS_ON_JOB, notes="Slipped on the ramp"
        ),
    )
    assert report.reason == AbsenceReason.ILLNESS_ON_JOB
    assert report.status == RequestStatus.SUBMITTED


async def test_time_off_does_not_require_notes(db_async: AsyncSession) -> None:
    user = await _user_with_create_perm(db_async)
    dept = await make_department(db_async, "dept_abs_timeoff")

    report = await create_absentee_report(
        session=db_async,
        current_user=user,
        payload=_payload(user.id, dept.id, AbsenceReason.TIME_OFF),
    )
    assert report.reason == AbsenceReason.TIME_OFF
