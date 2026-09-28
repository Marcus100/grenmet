"""Daily status-report service tests — permission requirement and create + entries."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.dailystatus import service
from src.hr.dailystatus.models import PersonnelStatus
from src.hr.dailystatus.schemas import StatusReportCreate, StatusReportEntryInput
from src.hr.dailystatus.service import create_status_report
from src.hr.models import RequestStatus
from src.hr.workflow.models import WorkflowType
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)


async def reporter(session: AsyncSession):
    user = await make_user(session)
    dept = await make_department(session)
    role, _ = await make_role_with_permission(session, "status.report.create")
    await assign_role(session, user=user, role=role)
    await make_submission_setup(session, user, dept.id, WorkflowType.STATUS_REPORT)
    return user, dept


async def test_draft_reopens_structured_personnel_and_equipment(db_async: AsyncSession):
    user, dept = await reporter(db_async)
    payload = StatusReportCreate(
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="N",
        as_draft=True,
        all_equipment_operational=False,
        equipment_issue_reason="Radio offline",
        equipment_remedy_action="Maintenance notified",
        entries=[
            StatusReportEntryInput(
                user_id=user.id, personnel_status=PersonnelStatus.UNCONFIRMED
            )
        ],
    )
    report, entries = await service.create_status_report(
        session=db_async, current_user=user, payload=payload
    )
    assert entries[0].personnel_status == PersonnelStatus.UNCONFIRMED
    changed = payload.model_copy(
        update={
            "entries": [
                StatusReportEntryInput(
                    user_id=user.id,
                    personnel_status=PersonnelStatus.PRESENT,
                    arrival_time="22:00",
                    departure_time="06:00",
                )
            ]
        }
    )
    await service.update_status_report(
        session=db_async, current_user=user, report_id=report.id, payload=changed
    )
    role, _ = await make_role_with_permission(db_async, "status.report.read")
    await assign_role(db_async, user=user, role=role)
    reopened, entries = await service.read_status_report_details(
        session=db_async, current_user=user, report_id=report.id
    )
    assert reopened.equipment_issue_reason == "Radio offline"
    assert reopened.shift_code == "N"
    assert [(row.arrival_time, row.departure_time) for row in entries] == [
        ("22:00", "06:00")
    ]


async def test_cross_department_personnel_and_department_are_denied(
    db_async: AsyncSession,
):
    from src.hr.exceptions import HRPermissionDeniedError, HRValidationError

    user, dept = await reporter(db_async)
    other = await make_user(db_async)
    elsewhere = await make_department(db_async)
    await make_employee(db_async, user=other, department_id=elsewhere.id)
    payload = StatusReportCreate(
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="M",
        as_draft=True,
        entries=[
            StatusReportEntryInput(
                user_id=other.id, personnel_status=PersonnelStatus.PRESENT
            )
        ],
    )
    with pytest.raises(HRValidationError, match="belong"):
        await service.create_status_report(
            session=db_async, current_user=user, payload=payload
        )
    with pytest.raises(HRPermissionDeniedError):
        await service.create_status_report(
            session=db_async,
            current_user=user,
            payload=payload.model_copy(
                update={"department_id": elsewhere.id, "entries": []}
            ),
        )


async def test_unconfirmed_draft_cannot_submit(db_async: AsyncSession):
    from src.hr.dailystatus.schemas import StatusReportSubmit
    from src.hr.exceptions import HRValidationError

    user, dept = await reporter(db_async)
    report, _ = await service.create_status_report(
        session=db_async,
        current_user=user,
        payload=StatusReportCreate(
            department_id=dept.id,
            report_date=date(2026, 9, 26),
            shift_code="M",
            as_draft=True,
            entries=[
                StatusReportEntryInput(
                    user_id=user.id, personnel_status=PersonnelStatus.UNCONFIRMED
                )
            ],
        ),
    )
    with pytest.raises(HRValidationError, match="Confirm"):
        await service.submit_status_report(
            session=db_async,
            current_user=user,
            status_report_id=report.id,
            payload=StatusReportSubmit(),
        )


async def test_staffing_preserves_saturday_night_and_d_coverage(db_async: AsyncSession):
    from src.hr.roster.models import (
        RosterAssignment,
        RosterPeriod,
        RosterPeriodStatus,
        ShiftCatalog,
        ShiftCategory,
    )

    user, dept = await reporter(db_async)
    for code in ("N", "D"):
        if await db_async.get(ShiftCatalog, code) is None:
            db_async.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=ShiftCategory.WORK,
                    start_time="22:00" if code == "N" else "08:00",
                    end_time="06:00" if code == "N" else "16:00",
                    ends_next_day=code == "N",
                )
            )
    period = RosterPeriod(
        department_id=dept.id,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=user.id,
    )
    db_async.add(period)
    await db_async.flush()
    db_async.add(
        RosterAssignment(
            roster_period_id=period.id,
            user_id=user.id,
            assignment_date=date(2026, 9, 26),
            shift_code="N",
        )
    )
    await db_async.commit()
    staffing = await service.staffing_for_shift(
        session=db_async,
        actor=user,
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="N",
    )
    assert len(staffing.entries) == 1
    assert staffing.entries[0].ends_next_day is True
    assert staffing.entries[0].personnel_status == PersonnelStatus.UNCONFIRMED
    assert (
        await service.staffing_for_shift(
            session=db_async,
            actor=user,
            department_id=dept.id,
            report_date=date(2026, 9, 27),
            shift_code="N",
        )
    ).entries == []
    day_worker = await make_user(db_async)
    await make_employee(db_async, user=day_worker, department_id=dept.id)
    day_assignment = RosterAssignment(
        roster_period_id=period.id,
        user_id=day_worker.id,
        assignment_date=date(2026, 9, 26),
        shift_code="D",
    )
    db_async.add(day_assignment)
    await db_async.commit()
    morning = await service.staffing_for_shift(
        session=db_async,
        actor=user,
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="M",
    )
    evening = await service.staffing_for_shift(
        session=db_async,
        actor=user,
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="E",
    )
    assert (
        morning.entries[0].roster_assignment_id
        == evening.entries[0].roster_assignment_id
        == day_assignment.id
    )
    assert (
        morning.entries[0].scheduled_shift_code
        == evening.entries[0].scheduled_shift_code
        == "D"
    )
    from src.hr.absentee.models import AbsenceReason, AbsenteeReport

    db_async.add(
        AbsenteeReport(
            user_id=user.id,
            department_id=dept.id,
            report_date=date(2026, 9, 26),
            submitted_by_user_id=user.id,
            reason=AbsenceReason.UNCERTIFIED_SICK,
            notes="Private medical context",
            expected_shift_code="N",
            status=RequestStatus.APPROVED,
        )
    )
    await db_async.commit()
    absent = await service.staffing_for_shift(
        session=db_async,
        actor=user,
        department_id=dept.id,
        report_date=date(2026, 9, 26),
        shift_code="N",
    )
    assert absent.entries[0].personnel_status == PersonnelStatus.ABSENT
    assert "Private medical context" not in absent.model_dump_json()


async def test_preview_is_pdf_and_does_not_persist(db_async: AsyncSession):
    from sqlalchemy import func, select

    from src.hr.dailystatus.models import StatusReport

    user, dept = await reporter(db_async)
    before = await db_async.scalar(select(func.count()).select_from(StatusReport))
    pdf = await service.preview_status_report_pdf(
        session=db_async,
        actor=user,
        payload=StatusReportCreate(
            department_id=dept.id,
            report_date=date(2026, 9, 26),
            shift_code="N",
            entries=[
                StatusReportEntryInput(
                    user_id=user.id, personnel_status=PersonnelStatus.UNCONFIRMED
                )
            ],
        ),
    )
    assert pdf.startswith(b"%PDF")
    assert (
        await db_async.scalar(select(func.count()).select_from(StatusReport)) == before
    )


@pytest.mark.parametrize(
    "field,value",
    [("arrival_time", "24:01"), ("departure_time", "9:15"), ("notes", "x" * 501)],
)
def test_personnel_field_validation(field, value):
    import uuid

    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        StatusReportEntryInput(
            user_id=uuid.uuid4(),
            personnel_status=PersonnelStatus.PRESENT,
            **{field: value},
        )


async def test_status_routes_real_jwt_signed_snapshot_and_department_scope(
    db_async, async_client
):
    import base64
    import io
    import json

    from PIL import Image
    from sqlalchemy import select

    from src.hr.signatures import service as signing
    from src.hr.signatures.models import SignedDocument
    from tests.utils.user import user_authentication_headers_async

    user, dept = await reporter(db_async)
    output = io.BytesIO()
    Image.new("RGB", (40, 20), "black").save(output, format="PNG")
    saved = await signing.save_signature(
        db_async,
        user,
        "data:image/png;base64," + base64.b64encode(output.getvalue()).decode(),
    )
    headers = await user_authentication_headers_async(
        client=async_client, email=user.email, password="password123"
    )
    payload = {
        "department_id": dept.id,
        "report_date": "2026-09-26",
        "shift_code": "N",
        "all_personnel_reported_on_time": True,
        "affected_operations": False,
        "all_equipment_operational": True,
        "incident_reports_submitted": True,
        "entries": [
            {
                "user_id": str(user.id),
                "personnel_status": "PRESENT",
                "arrival_time": "22:00",
                "departure_time": "06:00",
            }
        ],
        "signature_version": str(saved.version),
    }
    preview = await async_client.post(
        "/api/v1/hr/status-reports/preview-pdf", headers=headers, json=payload
    )
    assert preview.status_code == 200
    assert preview.content.startswith(b"%PDF")
    assert preview.headers["cache-control"] == "private, no-store"
    assert (
        await async_client.post("/api/v1/hr/status-reports/preview-pdf", json=payload)
    ).status_code == 401
    created = await async_client.post(
        "/api/v1/hr/status-reports", headers=headers, json=payload
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["report"]["id"]
    record = await db_async.scalar(
        select(SignedDocument).where(SignedDocument.entity_type == "status_report")
    )
    snapshot = json.loads(record.snapshot)
    assert snapshot["form"]["entries"][0]["employee_name"] == user.full_name
    assert snapshot["form"]["report_date"] == "2026-09-26"
    assert snapshot["form"]["department_name"] == dept.name
    assert snapshot["signer_name"] == user.full_name
    assert snapshot["signed_at"]
    other, other_dept = await reporter(db_async)
    role, _ = await make_role_with_permission(db_async, "status.report.read")
    await assign_role(db_async, user=other, role=role)
    other_headers = await user_authentication_headers_async(
        client=async_client, email=other.email, password="password123"
    )
    assert (
        await async_client.get(
            f"/api/v1/hr/status-reports/{report_id}", headers=other_headers
        )
    ).status_code == 403
    assert (
        await async_client.get(
            "/api/v1/hr/status-reports",
            headers=other_headers,
            params={"department_id": dept.id},
        )
    ).status_code == 403
    assert (
        await async_client.get(
            "/api/v1/hr/status-reports/staffing",
            headers=other_headers,
            params={
                "department_id": dept.id,
                "report_date": "2026-09-26",
                "shift_code": "N",
            },
        )
    ).status_code == 403


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

    await make_submission_setup(db_async, user, dept.id, WorkflowType.STATUS_REPORT)

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
