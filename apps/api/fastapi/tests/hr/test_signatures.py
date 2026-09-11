import base64
import hashlib
import io
import uuid
from datetime import date

import pytest
from PIL import Image, ImageDraw
from sqlmodel import select

from src.auth.models import User
from src.exceptions import AppException
from src.hr.leave import service as leave_service
from src.hr.leave.models import LeaveRequest, LeaveType
from src.hr.leave.schemas import LeaveRequestCreate, LeaveRequestSubmit
from src.hr.models import RequestStatus
from src.hr.signatures import service
from src.hr.signatures.models import SavedSignature, SignedDocument
from src.hr.workflow.models import WorkflowType
from tests.factories import (
    make_department,
    make_employee,
    make_submission_setup,
    make_user,
)


def signature_data(colour="black"):
    image = Image.new("RGB", (320, 100), "white")
    ImageDraw.Draw(image).line(
        (20, 70, 100, 20, 180, 60, 290, 30), fill=colour, width=4
    )
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


async def setup(session):
    actor = await make_user(session, superuser=True)
    department = await make_department(session)
    await make_employee(session, user=actor, department_id=department.id)
    await make_submission_setup(
        session, actor, department.id, WorkflowType.LEAVE_REQUEST
    )
    saved = await service.save_signature(session, actor, signature_data())
    return actor, department, saved


def leave_payload(department_id, **extra):
    return LeaveRequestCreate(
        department_id=department_id,
        leave_type=LeaveType.VACATION,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        days_requested=2,
        **extra,
    )


@pytest.mark.asyncio
async def test_signed_pdf_and_audit_survive_signature_replacement_and_deletion(
    db_async,
):
    actor, dept, saved = await setup(db_async)
    version = saved.version
    leave = await leave_service.create_leave_request(
        session=db_async,
        current_user=actor,
        payload=leave_payload(dept.id, signature_version=version),
    )
    record = await db_async.scalar(
        select(SignedDocument).where(SignedDocument.entity_id == leave.id)
    )
    assert record.pdf.startswith(b"%PDF-")
    assert hashlib.sha256(record.pdf).hexdigest() == record.sha256
    assert record.signer_id == actor.id and record.signature_version == version
    original = record.pdf
    await service.save_signature(db_async, actor, signature_data("blue"))
    await service.delete_signature(db_async, actor)
    assert await db_async.get(SavedSignature, actor.id) is None
    await db_async.refresh(record)
    assert record.pdf == original
    assert (await service.get_document(db_async, actor, record.id)).pdf == original
    assert (await service.list_documents(db_async, actor, 0, 20))[1] == 1


@pytest.mark.asyncio
async def test_draft_does_not_sign_until_explicit_submission(db_async):
    actor, dept, saved = await setup(db_async)
    draft = await leave_service.create_leave_request(
        session=db_async,
        current_user=actor,
        payload=leave_payload(dept.id, signature_version=saved.version, as_draft=True),
    )
    assert (await service.list_documents(db_async, actor, 0, 20))[1] == 0
    result = await leave_service.submit_leave_request(
        session=db_async,
        current_user=actor,
        leave_request_id=draft.id,
        payload=LeaveRequestSubmit(signature_version=saved.version),
    )
    assert result.status == RequestStatus.SUBMITTED
    assert (await service.list_documents(db_async, actor, 0, 20))[1] == 1
    with pytest.raises(AppException):
        await leave_service.submit_leave_request(
            session=db_async,
            current_user=actor,
            leave_request_id=draft.id,
            payload=LeaveRequestSubmit(signature_version=saved.version),
        )
    assert (await service.list_documents(db_async, actor, 0, 20))[1] == 1


@pytest.mark.asyncio
async def test_stale_or_other_users_signature_rolls_back_submission(db_async):
    actor, dept, saved = await setup(db_async)
    stale = saved.version
    await service.save_signature(db_async, actor, signature_data("blue"))
    actor_id, dept_id = actor.id, dept.id
    for version in (stale, uuid.uuid4()):
        with pytest.raises(AppException, match="signature changed"):
            await leave_service.create_leave_request(
                session=db_async,
                current_user=actor,
                payload=leave_payload(dept_id, signature_version=version),
            )
        await db_async.rollback()
        await db_async.refresh(actor)
        assert (
            await db_async.execute(
                select(LeaveRequest).where(LeaveRequest.user_id == actor_id)
            )
        ).first() is None
        assert (await service.list_documents(db_async, actor, 0, 20))[1] == 0


@pytest.mark.asyncio
async def test_failed_draft_signing_keeps_draft_and_no_signed_record(db_async):
    actor, dept, _ = await setup(db_async)
    draft = await leave_service.create_leave_request(
        session=db_async,
        current_user=actor,
        payload=leave_payload(dept.id, as_draft=True),
    )
    with pytest.raises(AppException):
        await leave_service.submit_leave_request(
            session=db_async,
            current_user=actor,
            leave_request_id=draft.id,
            payload=LeaveRequestSubmit(signature_version=uuid.uuid4()),
        )
    await db_async.rollback()
    await db_async.refresh(draft)
    assert draft.status == RequestStatus.DRAFT
    assert (await db_async.execute(select(SignedDocument))).first() is None


@pytest.mark.asyncio
async def test_unsigned_legacy_submission_does_not_apply_saved_signature(db_async):
    actor, dept, _ = await setup(db_async)
    await leave_service.create_leave_request(
        session=db_async, current_user=actor, payload=leave_payload(dept.id)
    )
    assert (await service.list_documents(db_async, actor, 0, 20))[1] == 0


@pytest.mark.asyncio
async def test_outsider_cannot_read_another_users_signed_document(db_async):
    actor, dept, saved = await setup(db_async)
    await leave_service.create_leave_request(
        session=db_async,
        current_user=actor,
        payload=leave_payload(dept.id, signature_version=saved.version),
    )
    record = (await service.list_documents(db_async, actor, 0, 20))[0][0]
    outsider = await make_user(db_async)
    await make_employee(db_async, user=outsider, department_id=dept.id)
    assert (await service.list_documents(db_async, outsider, 0, 20))[1] == 0
    with pytest.raises(AppException):
        await service.get_document(db_async, outsider, record.id)


@pytest.mark.asyncio
async def test_signature_routes_are_self_only_and_download_is_private(
    async_client, superuser_token_headers_async, db_async
):
    headers = superuser_token_headers_async
    assert (await async_client.get("/api/v1/hr/signature/me")).status_code == 401
    result = await async_client.put(
        "/api/v1/hr/signature/me",
        headers=headers,
        json={"image_data_url": signature_data()},
    )
    assert result.status_code == 200
    assert "no-store" in result.headers["cache-control"]
    read = await async_client.get("/api/v1/hr/signature/me", headers=headers)
    assert read.json()["version"] == result.json()["version"]
    saved = await db_async.scalar(select(SavedSignature))
    actor = await db_async.get(User, saved.user_id)
    dept = await make_department(db_async)
    await make_employee(db_async, user=actor, department_id=dept.id)
    await make_submission_setup(db_async, actor, dept.id, WorkflowType.LEAVE_REQUEST)
    submitted = await async_client.post(
        "/api/v1/hr/leave-requests",
        headers=headers,
        json=leave_payload(dept.id, signature_version=saved.version).model_dump(
            mode="json"
        ),
    )
    assert submitted.status_code == 201
    document_id = submitted.json()["signed_document_id"]
    assert document_id
    pdf = await async_client.get(
        f"/api/v1/hr/signed-documents/{document_id}/pdf", headers=headers
    )
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert pdf.headers["content-type"] == "application/pdf"
    assert "no-store" in pdf.headers["cache-control"]
    assert "attachment" in pdf.headers["content-disposition"]

    assert (
        await async_client.delete("/api/v1/hr/signature/me", headers=headers)
    ).status_code == 204
    assert (
        await async_client.get("/api/v1/hr/signature/me", headers=headers)
    ).json() is None


@pytest.mark.parametrize(
    "value",
    [
        "data:image/svg+xml;base64,aaaa",
        "data:image/png;base64,!!!",
        "data:image/png;base64,aGVsbG8=",
    ],
)
def test_invalid_images_rejected(value):
    with pytest.raises(AppException):
        service.normalize_image(value)


def test_blank_and_oversized_dimensions_rejected():
    for size in ((320, 100), (2001, 20)):
        image = Image.new("RGB", size, "white")
        output = io.BytesIO()
        image.save(output, format="PNG")
        with pytest.raises(AppException):
            service.normalize_image(
                "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()
            )


@pytest.mark.asyncio
async def test_pdf_failure_cannot_commit_a_submission(db_async, monkeypatch):
    actor, dept, saved = await setup(db_async)
    actor_id = actor.id

    def fail_render(*_args):
        raise RuntimeError("PDF unavailable")

    monkeypatch.setattr(service, "render_pdf", fail_render)
    with pytest.raises(RuntimeError, match="PDF unavailable"):
        await leave_service.create_leave_request(
            session=db_async,
            current_user=actor,
            payload=leave_payload(dept.id, signature_version=saved.version),
        )
    await db_async.rollback()
    assert (
        await db_async.execute(
            select(LeaveRequest).where(LeaveRequest.user_id == actor_id)
        )
    ).first() is None
    assert (await db_async.execute(select(SignedDocument))).first() is None
