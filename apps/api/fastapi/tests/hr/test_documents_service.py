"""Employee document service tests — upload validation and the access gate.

Storage is not configured in the test environment, so the two boto3-backed calls
are patched out. Everything above them — permissions, sensitivity derivation,
validation, archiving — is exercised for real against the database.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.documents import service as documents_service
from src.hr.documents.models import (
    DocumentCategory,
    DocumentSensitivity,
    EmployeeDocument,
)
from src.hr.documents.schemas import (
    DocumentUpload,
    EmployeeDocumentCreate,
    EmployeeDocumentUpdate,
)
from src.hr.documents.service import (
    archive_document,
    create_document,
    get_document,
    list_documents,
    update_document,
)
from src.hr.exceptions import (
    EmployeeDocumentNotFoundError,
    HRPermissionDeniedError,
    HRValidationError,
)
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)


@pytest.fixture(autouse=True)
def _stub_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neutralize the object-storage round trip; keep every other code path live."""

    async def _noop_store(*, key: str, upload: DocumentUpload) -> None:  # noqa: ARG001
        return None

    monkeypatch.setattr(documents_service, "_store_object", _noop_store)


def _upload(
    *,
    filename: str = "certificate.pdf",
    content_type: str = "application/pdf",
    data: bytes = b"%PDF-1.4 scanned certificate",
) -> DocumentUpload:
    return DocumentUpload(filename=filename, content_type=content_type, data=data)


def _payload(
    *,
    user_id: uuid.UUID,
    category: DocumentCategory = DocumentCategory.CERTIFICATION,
    title: str = "Met observer certificate",
    **kwargs: object,
) -> EmployeeDocumentCreate:
    return EmployeeDocumentCreate(
        user_id=user_id, category=category, title=title, **kwargs
    )


async def _uploader(session: AsyncSession, *permission_keys: str):
    user = await make_user(session)
    department = await make_department(session)
    await make_employee(session, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(
        session, "hr.document.create", *permission_keys
    )
    await assign_role(session, user=user, role=role)
    return user


async def test_create_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)

    with pytest.raises(AuthorizationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(),
        )


async def test_create_stores_metadata_and_derives_standard_sensitivity(
    db_async: AsyncSession,
) -> None:
    user = await _uploader(db_async)

    document = await create_document(
        session=db_async,
        current_user=user,
        payload=_payload(user_id=user.id, issuing_authority="Caribbean Met Institute"),
        upload=_upload(),
    )

    assert document.user_id == user.id
    assert document.uploaded_by_user_id == user.id
    assert document.sensitivity == DocumentSensitivity.STANDARD
    assert document.size_bytes == len(b"%PDF-1.4 scanned certificate")
    assert document.object_key.endswith(".pdf")
    assert str(document.id) in document.object_key
    assert document.archived_at is None


@pytest.mark.parametrize(
    "category",
    [
        DocumentCategory.MEDICAL,
        DocumentCategory.DISCIPLINARY,
        DocumentCategory.APPRAISAL,
        DocumentCategory.OTHER,
    ],
)
async def test_deferred_category_is_rejected(
    db_async: AsyncSession, category: DocumentCategory
) -> None:
    user = await _uploader(db_async)
    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id, category=category),
            upload=_upload(),
        )


async def _existing_document(
    session: AsyncSession, user_id: uuid.UUID, category: DocumentCategory
) -> EmployeeDocument:
    from src.hr.documents.models import sensitivity_for

    document = EmployeeDocument(
        organisation_id="gaa",
        user_id=user_id,
        category=category,
        title=category.value,
        sensitivity=sensitivity_for(category),
        object_key=str(uuid.uuid4()),
        original_filename="record.pdf",
        content_type="application/pdf",
        size_bytes=10,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


async def test_disallowed_content_type_is_rejected(db_async: AsyncSession) -> None:
    user = await _uploader(db_async)

    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(
                filename="payload.exe", content_type="application/x-msdownload"
            ),
        )


async def test_empty_and_oversize_files_are_rejected(db_async: AsyncSession) -> None:
    user = await _uploader(db_async)

    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(data=b""),
        )

    oversize = b"x" * (documents_service.MAX_DOCUMENT_BYTES + 1)
    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(data=oversize),
        )


async def test_expiry_before_issue_is_rejected(db_async: AsyncSession) -> None:
    user = await _uploader(db_async)

    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(
                user_id=user.id,
                issued_date=date(2026, 6, 1),
                expiry_date=date(2026, 5, 1),
            ),
            upload=_upload(),
        )


async def test_filing_for_another_user_needs_authority(db_async: AsyncSession) -> None:
    uploader = await _uploader(db_async)
    other = await make_user(db_async)

    with pytest.raises(HRPermissionDeniedError):
        await create_document(
            session=db_async,
            current_user=uploader,
            payload=_payload(user_id=other.id),
            upload=_upload(),
        )


async def test_supervisor_reads_credentials_but_not_personnel_or_deferred(
    db_async: AsyncSession,
) -> None:
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "hr.document.read.department"
    )
    certificate = await _existing_document(
        db_async, employee.id, DocumentCategory.CERTIFICATION
    )
    contract = await _existing_document(
        db_async, employee.id, DocumentCategory.CONTRACT
    )
    medical = await _existing_document(db_async, employee.id, DocumentCategory.MEDICAL)
    assert (
        await get_document(
            session=db_async, current_user=supervisor, document_id=certificate.id
        )
    ).id == certificate.id
    for document in (contract, medical):
        with pytest.raises(HRPermissionDeniedError):
            await get_document(
                session=db_async, current_user=supervisor, document_id=document.id
            )
    with pytest.raises(HRPermissionDeniedError):
        await get_document(
            session=db_async, current_user=employee, document_id=medical.id
        )
    rows, total = await list_documents(
        session=db_async, current_user=supervisor, department_id=dept.id
    )
    assert total == 1
    assert [row.id for row in rows] == [certificate.id]
    own, total = await list_documents(session=db_async, current_user=employee)
    assert total == 2
    assert {row.id for row in own} == {certificate.id, contract.id}


async def test_department_filter_cannot_widen_scope_or_counts(
    db_async: AsyncSession,
) -> None:
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "hr.document.read.department"
    )
    other_dept = await make_department(db_async)
    outsider = await make_user(db_async)
    await make_employee(db_async, user=outsider, department_id=other_dept.id)
    foreign = await _existing_document(
        db_async, outsider.id, DocumentCategory.CERTIFICATION
    )
    await _existing_document(db_async, employee.id, DocumentCategory.CERTIFICATION)
    rows, total = await list_documents(
        session=db_async, current_user=supervisor, department_id=other_dept.id
    )
    assert rows == [] and total == 0
    with pytest.raises(HRPermissionDeniedError):
        await list_documents(
            session=db_async, current_user=supervisor, user_id=outsider.id
        )
    with pytest.raises(HRPermissionDeniedError):
        await get_document(
            session=db_async, current_user=supervisor, document_id=foreign.id
        )
    rows, total = await list_documents(
        session=db_async,
        current_user=supervisor,
        department_id=dept.id,
        user_id=supervisor.id,
    )
    assert rows == [] and total == 0


async def test_department_listing_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_documents_list")
    await make_employee(db_async, user=user, department_id=dept.id)

    with pytest.raises(AuthorizationError):
        await list_documents(session=db_async, current_user=user, department_id=dept.id)

    own, total = await list_documents(session=db_async, current_user=user)
    assert own == []
    assert total == 0


async def test_archive_is_soft_and_excluded_by_default(db_async: AsyncSession) -> None:
    user = await _uploader(db_async)
    document = await create_document(
        session=db_async,
        current_user=user,
        payload=_payload(user_id=user.id),
        upload=_upload(),
    )

    archived = await archive_document(
        session=db_async, current_user=user, document_id=document.id
    )
    assert archived.archived_at is not None
    assert archived.archived_by_user_id == user.id

    # The row survives — an HR document is evidence, not a cache entry.
    assert await db_async.get(EmployeeDocument, document.id) is not None

    rows, total = await list_documents(session=db_async, current_user=user)
    assert total == 0

    rows, total = await list_documents(
        session=db_async, current_user=user, include_archived=True
    )
    assert total == 1


async def test_update_corrects_metadata_and_validates_dates(
    db_async: AsyncSession,
) -> None:
    user = await _uploader(db_async)
    document = await create_document(
        session=db_async,
        current_user=user,
        payload=_payload(user_id=user.id, issued_date=date(2026, 1, 1)),
        upload=_upload(),
    )

    updated = await update_document(
        session=db_async,
        current_user=user,
        document_id=document.id,
        payload=EmployeeDocumentUpdate(expiry_date=date(2028, 1, 1)),
    )
    assert updated.expiry_date == date(2028, 1, 1)
    assert updated.title == "Met observer certificate"

    with pytest.raises(HRValidationError):
        await update_document(
            session=db_async,
            current_user=user,
            document_id=document.id,
            payload=EmployeeDocumentUpdate(expiry_date=date(2025, 1, 1)),
        )


async def test_owner_cannot_change_hr_filed_contract(db_async: AsyncSession) -> None:
    hr, employee, _, _ = await make_supervised_pair(
        db_async, "hr.document.create", "hr.document.manage"
    )
    document = await create_document(
        session=db_async,
        current_user=hr,
        payload=_payload(user_id=employee.id, category=DocumentCategory.CONTRACT),
        upload=_upload(),
    )
    with pytest.raises(HRPermissionDeniedError):
        await archive_document(
            session=db_async, current_user=employee, document_id=document.id
        )
    with pytest.raises(HRPermissionDeniedError):
        await update_document(
            session=db_async,
            current_user=employee,
            document_id=document.id,
            payload=EmployeeDocumentUpdate(title="Changed"),
        )
    assert (
        await get_document(
            session=db_async, current_user=employee, document_id=document.id
        )
    ).id == document.id


async def test_get_document_not_found(db_async: AsyncSession) -> None:
    user = await make_user(db_async)

    with pytest.raises(EmployeeDocumentNotFoundError):
        await get_document(
            session=db_async, current_user=user, document_id=uuid.uuid4()
        )


async def test_hr_management_requires_target_scope(db_async: AsyncSession) -> None:
    hr, employee, _, _ = await make_supervised_pair(
        db_async, "hr.document.create", "hr.document.manage"
    )
    outsider = await make_user(db_async)
    other_dept = await make_department(db_async)
    await make_employee(db_async, user=outsider, department_id=other_dept.id)
    foreign = await _existing_document(db_async, outsider.id, DocumentCategory.CONTRACT)
    for actor in (hr,):
        with pytest.raises(HRPermissionDeniedError):
            await archive_document(
                session=db_async, current_user=actor, document_id=foreign.id
            )
        with pytest.raises(HRPermissionDeniedError):
            await update_document(
                session=db_async,
                current_user=actor,
                document_id=foreign.id,
                payload=EmployeeDocumentUpdate(title="Changed"),
            )
        with pytest.raises(HRPermissionDeniedError):
            await create_document(
                session=db_async,
                current_user=actor,
                payload=_payload(user_id=outsider.id),
                upload=_upload(),
            )
    own_scope = await _existing_document(
        db_async, employee.id, DocumentCategory.CONTRACT
    )
    assert (
        await update_document(
            session=db_async,
            current_user=hr,
            document_id=own_scope.id,
            payload=EmployeeDocumentUpdate(title="Corrected"),
        )
    ).title == "Corrected"


async def test_expired_assignment_does_not_grant_access(db_async: AsyncSession) -> None:
    from datetime import timedelta

    from sqlmodel import select

    from src.auth.models import UserRoleAssignment
    from src.utils.datetime import utc_now

    hr, employee, _, _ = await make_supervised_pair(
        db_async, "hr.document.create", "hr.document.manage"
    )
    document = await _existing_document(
        db_async, employee.id, DocumentCategory.CONTRACT
    )
    assignment = (
        (
            await db_async.execute(
                select(UserRoleAssignment).where(UserRoleAssignment.user_id == hr.id)
            )
        )
        .scalars()
        .one()
    )
    assignment.effective_to = utc_now() - timedelta(seconds=1)
    db_async.add(assignment)
    await db_async.commit()
    with pytest.raises(HRPermissionDeniedError):
        await get_document(session=db_async, current_user=hr, document_id=document.id)


async def test_storage_failure_does_not_create_metadata(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.storage.service import StorageNotConfiguredError

    async def fail_store(**_kwargs):
        raise StorageNotConfiguredError()

    monkeypatch.setattr(documents_service, "_store_object", fail_store)
    user = await _uploader(db_async)
    with pytest.raises(StorageNotConfiguredError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(),
        )
    assert await list_documents(session=db_async, current_user=user) == ([], 0)


@pytest.mark.parametrize("title", [None, "   "])
async def test_title_cannot_be_cleared(
    db_async: AsyncSession, title: str | None
) -> None:
    user = await _uploader(db_async)
    document = await create_document(
        session=db_async,
        current_user=user,
        payload=_payload(user_id=user.id),
        upload=_upload(),
    )
    with pytest.raises(HRValidationError):
        await update_document(
            session=db_async,
            current_user=user,
            document_id=document.id,
            payload=EmployeeDocumentUpdate(title=title),
        )


async def test_oversize_filename_is_rejected_before_storage(
    db_async: AsyncSession,
) -> None:
    user = await _uploader(db_async)
    with pytest.raises(HRValidationError):
        await create_document(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id),
            upload=_upload(filename="x" * 256),
        )
