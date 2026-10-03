"""Absentee service tests — reason enum and conditional-notes rule."""

import json
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.absentee.models import AbsenceReason
from src.hr.absentee.schemas import AbsenteeReportCreate, AbsenteeReportSubmit
from src.hr.absentee.service import (
    create_absentee_report,
    list_absentee_reports,
    preview_absentee_report_pdf,
    submit_absentee_report,
    update_absentee_report,
)
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.models import RequestStatus
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.signatures import service as signature_service
from src.hr.signatures.models import SignedDocument
from src.hr.workflow.models import WorkflowType
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_submission_setup,
    make_supervised_pair,
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

    await make_submission_setup(db_async, user, dept.id, WorkflowType.ABSENTEE_REPORT)

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

    await make_submission_setup(db_async, user, dept.id, WorkflowType.ABSENTEE_REPORT)

    report = await create_absentee_report(
        session=db_async,
        current_user=user,
        payload=_payload(user.id, dept.id, AbsenceReason.TIME_OFF),
    )
    assert report.reason == AbsenceReason.TIME_OFF


async def _draft(db_async: AsyncSession):
    user = await _user_with_create_perm(db_async)
    dept = await make_department(db_async)
    await make_submission_setup(db_async, user, dept.id, WorkflowType.ABSENTEE_REPORT)
    payload = _payload(user.id, dept.id, AbsenceReason.TIME_OFF)
    payload.as_draft = True
    report = await create_absentee_report(
        session=db_async, current_user=user, payload=payload
    )
    return user, dept, report


async def test_draft_edit_cannot_switch_to_an_unauthorized_employee(db_async):
    user, dept, report = await _draft(db_async)
    outsider = await make_user(db_async)
    with pytest.raises(HRPermissionDeniedError):
        await update_absentee_report(
            session=db_async,
            current_user=user,
            absentee_report_id=report.id,
            payload=_payload(outsider.id, dept.id, AbsenceReason.TIME_OFF),
        )
    await db_async.refresh(report)
    assert report.user_id == user.id
    assert report.status == RequestStatus.DRAFT


async def test_draft_edit_cannot_bypass_required_reason_notes(db_async):
    user, dept, report = await _draft(db_async)
    with pytest.raises(HRValidationError):
        await update_absentee_report(
            session=db_async,
            current_user=user,
            absentee_report_id=report.id,
            payload=_payload(user.id, dept.id, AbsenceReason.UNCERTIFIED_SICK, "  "),
        )
    await db_async.refresh(report)
    assert report.reason == AbsenceReason.TIME_OFF


async def test_legacy_incomplete_draft_cannot_enter_approval(db_async):
    user, _, report = await _draft(db_async)
    report.reason = AbsenceReason.UNCERTIFIED_SICK
    report.notes = None
    await db_async.commit()
    with pytest.raises(HRValidationError):
        await submit_absentee_report(
            session=db_async,
            current_user=user,
            absentee_report_id=report.id,
            payload=AbsenteeReportSubmit(),
        )
    await db_async.refresh(report)
    assert report.status == RequestStatus.DRAFT


async def test_absentee_rejects_a_mismatched_employee_department(db_async):
    user, _, _ = await _draft(db_async)
    other = await make_department(db_async)
    with pytest.raises(HRPermissionDeniedError, match="does not belong"):
        await create_absentee_report(
            session=db_async,
            current_user=user,
            payload=_payload(user.id, other.id, AbsenceReason.TIME_OFF),
        )


async def test_reporter_can_reopen_their_proxy_draft(db_async):
    reporter, subject, dept, _ = await make_supervised_pair(
        db_async, "absentee.report.create"
    )
    await make_submission_setup(
        db_async, reporter, dept.id, WorkflowType.ABSENTEE_REPORT
    )
    payload = _payload(subject.id, dept.id, AbsenceReason.TIME_OFF)
    payload.as_draft = True
    report = await create_absentee_report(
        session=db_async, current_user=reporter, payload=payload
    )
    rows, total = await list_absentee_reports(session=db_async, current_user=reporter)
    assert total == 1 and rows[0].id == report.id
    assert rows[0].user_id == subject.id
    assert rows[0].submitted_by_user_id == reporter.id
    rows, total = await list_absentee_reports(session=db_async, current_user=subject)
    assert total == 1 and rows[0].id == report.id


async def test_draft_can_save_missing_sickness_details_but_cannot_submit(db_async):
    user, dept, _ = await _draft(db_async)
    payload = _payload(user.id, dept.id, AbsenceReason.UNCERTIFIED_SICK)
    payload.as_draft = True
    draft = await create_absentee_report(
        session=db_async, current_user=user, payload=payload
    )
    assert draft.status == RequestStatus.DRAFT
    with pytest.raises(HRValidationError):
        await submit_absentee_report(
            session=db_async,
            current_user=user,
            absentee_report_id=draft.id,
            payload=AbsenteeReportSubmit(),
        )


async def test_preview_uses_published_roster_and_does_not_save_a_report(db_async):
    user, dept, draft = await _draft(db_async)
    if not await db_async.get(ShiftCatalog, "N"):
        db_async.add(
            ShiftCatalog(
                code="N",
                label="Night",
                category=ShiftCategory.WORK,
                start_time="22:30",
                end_time="06:00",
                ends_next_day=True,
            )
        )
    period = RosterPeriod(
        department_id=dept.id,
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 31),
        created_by_user_id=user.id,
        status=RosterPeriodStatus.PUBLISHED,
    )
    db_async.add(period)
    await db_async.flush()
    db_async.add(
        RosterAssignment(
            roster_period_id=period.id,
            user_id=user.id,
            assignment_date=date(2026, 7, 1),
            shift_code="N",
        )
    )
    await db_async.commit()
    payload = _payload(user.id, dept.id, AbsenceReason.UNCERTIFIED_SICK)
    pdf = await preview_absentee_report_pdf(
        session=db_async, current_user=user, payload=payload
    )
    assert pdf.startswith(b"%PDF-")
    assert payload.expected_shift_code == "N"
    rows, total = await list_absentee_reports(session=db_async, current_user=user)
    assert total == 1 and rows[0].id == draft.id
    assert await db_async.scalar(select(SignedDocument.id)) is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("absence_start_time", "25:00"),
        ("absence_end_time", "06:99"),
        ("notes", "x" * 1001),
    ],
)
def test_absentee_rejects_invalid_time_or_oversized_notes(field, value):
    import uuid

    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AbsenteeReportCreate(
            user_id=uuid.uuid4(),
            department_id="met",
            report_date=date(2026, 7, 1),
            reason=AbsenceReason.TIME_OFF,
            **{field: value},
        )


async def test_absentee_preview_route_requires_authentication(async_client, db_async):
    from tests.utils.user import user_authentication_headers_async

    user, dept, _ = await _draft(db_async)
    payload = _payload(user.id, dept.id, AbsenceReason.TIME_OFF).model_dump(mode="json")
    assert (
        await async_client.post("/api/v1/hr/absentee-reports/preview-pdf", json=payload)
    ).status_code == 401
    headers = await user_authentication_headers_async(
        client=async_client, email=user.email, password="password123"
    )
    result = await async_client.post(
        "/api/v1/hr/absentee-reports/preview-pdf", headers=headers, json=payload
    )
    assert result.status_code == 200, result.text
    assert result.content.startswith(b"%PDF-")
    assert "no-store" in result.headers["cache-control"]
    assert "inline" in result.headers["content-disposition"]
    outsider = await make_user(db_async)
    await make_employee(db_async, user=outsider, department_id=dept.id)
    result = await async_client.post(
        "/api/v1/hr/absentee-reports/preview-pdf",
        headers=headers,
        json={**payload, "user_id": str(outsider.id)},
    )
    assert result.status_code == 403


async def test_proxy_signed_snapshot_keeps_reporter_and_subject_distinct(db_async):
    import base64
    import io

    from PIL import Image

    reporter, subject, dept, _ = await make_supervised_pair(
        db_async, "absentee.report.create"
    )
    reporter.first_name = "Reporter"
    subject.first_name = "Absent"
    db_async.add_all([reporter, subject])
    await db_async.commit()
    await make_submission_setup(
        db_async, reporter, dept.id, WorkflowType.ABSENTEE_REPORT
    )
    png = io.BytesIO()
    Image.new("RGB", (40, 20), "black").save(png, format="PNG")
    signature = await signature_service.save_signature(
        db_async,
        reporter,
        "data:image/png;base64," + base64.b64encode(png.getvalue()).decode(),
    )
    payload = _payload(
        subject.id, dept.id, AbsenceReason.UNCERTIFIED_SICK, "Called in sick"
    )
    payload.signature_version = signature.version
    report = await create_absentee_report(
        session=db_async, current_user=reporter, payload=payload
    )
    document = await db_async.scalar(
        select(SignedDocument).where(SignedDocument.entity_id == report.id)
    )
    assert document is not None and document.pdf.startswith(b"%PDF-")
    snapshot = json.loads(document.snapshot)
    assert snapshot["signer_name"] == reporter.full_name
    assert snapshot["form"]["employee_name"] == subject.full_name
    assert snapshot["form"]["report_date"] == "2026-07-01"
    assert snapshot["signed_at"]


async def test_department_report_listing_requires_department_scope(db_async):
    from src.auth.models import RoleAssignmentScope
    from src.exceptions import AppException

    user, dept, _ = await _draft(db_async)
    role, _ = await make_role_with_permission(
        db_async, "absentee.report.read.department"
    )
    await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )
    rows, count = await list_absentee_reports(
        session=db_async, current_user=user, department_id=dept.id
    )
    assert count == 1 and rows
    other = await make_department(db_async)
    with pytest.raises(AppException):
        await list_absentee_reports(
            session=db_async, current_user=user, department_id=other.id
        )


@pytest.mark.parametrize("start,end", [("09:00", None), ("25:00", "26:00")])
async def test_legacy_draft_times_are_revalidated_before_submission(
    db_async, start, end
):
    from src.hr.absentee.schemas import AbsenteeReportSubmit
    from src.hr.absentee.service import submit_absentee_report

    user, _, report = await _draft(db_async)
    report.absence_start_time = start
    report.absence_end_time = end
    await db_async.commit()
    with pytest.raises(HRValidationError):
        await submit_absentee_report(
            session=db_async,
            current_user=user,
            absentee_report_id=report.id,
            payload=AbsenteeReportSubmit(),
        )
    assert report.status == RequestStatus.DRAFT
