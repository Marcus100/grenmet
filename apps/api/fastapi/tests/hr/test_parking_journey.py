import json
from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from src.auth.models import RoleAssignmentScope
from src.auth.utils import create_access_token
from src.hr.models import RequestStatus
from src.hr.parking import service
from src.hr.parking.models import ParkingPermit
from src.hr.parking.schemas import ParkingPermitCreate, ParkingPermitIssue
from src.hr.signatures import service as signatures
from src.hr.signatures.models import SignedDocument
from src.hr.workflow.models import WorkflowType
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)
from tests.hr.test_signatures import signature_data


def headers(user):
    from datetime import timedelta

    return {
        "Authorization": f"Bearer {create_access_token(user.id, timedelta(minutes=15))}"
    }


async def setup(session):
    actor = await make_user(session, superuser=True)
    department = await make_department(session)
    await make_submission_setup(
        session, actor, department.id, WorkflowType.PARKING_PERMIT
    )
    saved = await signatures.save_signature(session, actor, signature_data())
    return actor, department, saved


async def test_authenticated_parking_draft_pdf_submit_approval_and_issuance(
    db_async, async_client
):
    actor, dept, saved = await setup(db_async)
    auth = headers(actor)
    payload = {
        "user_id": str(actor.id),
        "department_id": dept.id,
        "company_name": "GAA",
        "phone": "473-555-0100",
        "vehicle_registration_no": "P1234",
        "vehicle_insurance_issue_date": "2026-01-01",
        "vehicle_insurance_expiry_date": "2027-01-01",
        "as_draft": True,
    }
    preview = await async_client.post(
        "/api/v1/hr/parking-permits/preview-pdf", headers=auth, json=payload
    )
    assert preview.status_code == 200 and preview.content.startswith(b"%PDF")
    assert preview.headers["cache-control"] == "private, no-store"
    assert await db_async.scalar(select(func.count()).select_from(ParkingPermit)) == 0
    response = await async_client.post(
        "/api/v1/hr/parking-permits", headers=auth, json=payload
    )
    assert response.status_code == 201, response.text
    permit_id = response.json()["id"]
    assert response.json()["signed_document_id"] is None
    payload["vehicle_registration_no"] = "P5678"
    updated = await async_client.patch(
        f"/api/v1/hr/parking-permits/{permit_id}", headers=auth, json=payload
    )
    assert (
        updated.status_code == 200
        and updated.json()["vehicle_registration_no"] == "P5678"
    )
    listed = await async_client.get("/api/v1/hr/parking-permits", headers=auth)
    assert listed.json()["data"][0]["phone"] == "473-555-0100"
    submitted = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit_id}/submit",
        headers=auth,
        json={"signature_version": str(saved.version)},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "SUBMITTED"
    document_id = submitted.json()["signed_document_id"]
    document = await async_client.get(
        f"/api/v1/hr/signed-documents/{document_id}/pdf", headers=auth
    )
    assert document.status_code == 200 and document.content.startswith(b"%PDF")
    record = await db_async.get(SignedDocument, document_id)
    snapshot = json.loads(record.snapshot)
    assert snapshot["form"]["employee_name"] == actor.full_name
    assert snapshot["form"]["vehicle_registration_no"] == "P5678"
    original_pdf = record.pdf
    issue = {
        "decal_number": "SEC-1",
        "valid_from": "2026-09-28",
        "valid_to": "2027-01-01",
        "received_by": actor.full_name,
    }
    denied = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit_id}/issue", headers=auth, json=issue
    )
    assert denied.status_code == 400
    permit = await db_async.get(ParkingPermit, permit_id)
    officer = await make_user(db_async, superuser=True)
    approval = await async_client.post(
        f"/api/v1/hr/workflows/instances/{permit.workflow_instance_id}/actions",
        headers=headers(officer),
        json={"action": "APPROVE"},
    )
    assert approval.status_code == 200, approval.text
    await db_async.refresh(permit)
    assert permit.status == RequestStatus.APPROVED
    issued = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit_id}/issue", headers=auth, json=issue
    )
    assert issued.status_code == 200, issued.text
    repeated = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit_id}/issue", headers=auth, json=issue
    )
    assert repeated.json()["issued_at"] == issued.json()["issued_at"]
    changed = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit_id}/issue",
        headers=auth,
        json={**issue, "decal_number": "SEC-2"},
    )
    assert changed.status_code == 400
    assert (
        await signatures.get_document(db_async, actor, record.id)
    ).pdf == original_pdf


async def test_cross_department_parking_scope_and_forged_department(
    db_async, async_client
):
    actor, dept, _ = await setup(db_async)
    other = await make_department(db_async)
    officer = await make_user(db_async)
    role, _ = await make_role_with_permission(
        db_async, "parking.permit.read.department", "parking.permit.issue"
    )
    await assign_role(
        db_async,
        user=officer,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=other.id,
    )
    auth = headers(officer)
    response = await async_client.get(
        "/api/v1/hr/parking-permits", headers=auth, params={"department_id": dept.id}
    )
    assert response.status_code == 403
    forged = await async_client.post(
        "/api/v1/hr/parking-permits",
        headers=headers(actor),
        json={
            "user_id": str(actor.id),
            "department_id": other.id,
            "vehicle_registration_no": "P100",
            "as_draft": True,
        },
    )
    assert forged.status_code == 403
    permit = await service.create_parking_permit(
        session=db_async,
        current_user=actor,
        payload=ParkingPermitCreate(
            user_id=actor.id,
            department_id=dept.id,
            vehicle_registration_no="P100",
            as_draft=True,
        ),
    )
    issue = await async_client.post(
        f"/api/v1/hr/parking-permits/{permit.id}/issue",
        headers=auth,
        json={
            "decal_number": "X",
            "valid_from": "2026-01-01",
            "valid_to": "2027-01-01",
        },
    )
    assert issue.status_code == 403


def test_parking_dates_text_and_other_validation():
    import uuid

    values = {
        "user_id": uuid.uuid4(),
        "department_id": "met",
        "vehicle_registration_no": "P123",
    }
    with pytest.raises(ValidationError):
        ParkingPermitCreate(**{**values, "vehicle_registration_no": "  "})
    with pytest.raises(ValidationError):
        ParkingPermitCreate(
            **values,
            vehicle_insurance_issue_date=date(2026, 2, 1),
            vehicle_insurance_expiry_date=date(2026, 1, 1),
        )
    with pytest.raises(ValidationError):
        ParkingPermitCreate(**values, action_requested="OTHER")
    ParkingPermitCreate(**values, action_requested="OTHER", as_draft=True)
    with pytest.raises(ValidationError):
        ParkingPermitIssue(
            decal_number="X", valid_from=date(2026, 2, 1), valid_to=date(2026, 1, 1)
        )
