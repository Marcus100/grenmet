"""Employee document storage.

Files are uploaded through the API rather than by presigned PUT direct to
storage. At GAA's volume the scaling argument for presigning buys nothing, and
routing the bytes through here is what lets the API guarantee that what landed
in the bucket is what the row claims: declared type checked against an
allowlist, size capped, and the row and the object committed together. The
storage call is isolated behind ``_store_object`` so a future switch to
presigned uploads is a change to this module alone.
"""

import logging
import mimetypes
import uuid
from datetime import date

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.constants import (
    ERROR_DOCUMENT_EMPTY_FILE,
    ERROR_DOCUMENT_EXPIRY_BEFORE_ISSUE,
    ERROR_DOCUMENT_FILE_FOR_USER_NOT_ALLOWED,
    ERROR_DOCUMENT_MANAGE_NOT_ALLOWED,
    ERROR_DOCUMENT_READ_NOT_ALLOWED,
    ERROR_DOCUMENT_TOO_LARGE,
    ERROR_DOCUMENT_TYPE_NOT_ALLOWED,
)
from src.hr.exceptions import (
    EmployeeDocumentNotFoundError,
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import EmploymentRecord
from src.storage.service import storage_service
from src.utils.datetime import utc_now

from .access import LAUNCH_CATEGORIES, SUPERVISOR_CATEGORIES, resolve_access
from .models import (
    DocumentCategory,
    DocumentSensitivity,
    EmployeeDocument,
    sensitivity_for,
)
from .schemas import DocumentUpload, EmployeeDocumentCreate, EmployeeDocumentUpdate

logger = logging.getLogger(__name__)

# Scans and office documents. Anything not listed is rejected outright rather
# than stored as application/octet-stream — an HR file whose type is unknown is
# a file nobody can safely open later.
ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

# Presigned download links are short-lived: the link is the capability, so it
# should outlive the click and nothing more.
DOWNLOAD_URL_EXPIRY_SECONDS = 120

STORAGE_PREFIX = "hr/documents"


def _extension_for(content_type: str, filename: str) -> str:
    """Prefer the extension the allowlist dictates over whatever the client sent."""
    allowed = ALLOWED_CONTENT_TYPES.get(content_type)
    if allowed:
        return allowed
    guessed = mimetypes.guess_extension(content_type)
    if guessed:
        return guessed
    _, dot, suffix = filename.rpartition(".")
    return f".{suffix.lower()}" if dot and suffix.isalnum() else ""


def object_key_for(
    *, user_id: uuid.UUID, document_id: uuid.UUID, extension: str
) -> str:
    return f"{STORAGE_PREFIX}/{user_id}/{document_id}{extension}"


def _validate_upload(upload: DocumentUpload) -> None:
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HRValidationError(
            ERROR_DOCUMENT_TYPE_NOT_ALLOWED.format(content_type=upload.content_type)
        )
    if len(upload.filename) > 255:
        raise HRValidationError("Document filename must be 255 characters or fewer")
    if not upload.data:
        raise HRValidationError(ERROR_DOCUMENT_EMPTY_FILE)
    if len(upload.data) > MAX_DOCUMENT_BYTES:
        raise HRValidationError(
            ERROR_DOCUMENT_TOO_LARGE.format(
                limit_mb=MAX_DOCUMENT_BYTES // (1024 * 1024)
            )
        )


def _validate_dates(issued_date: date | None, expiry_date: date | None) -> None:
    if issued_date and expiry_date and expiry_date < issued_date:
        raise HRValidationError(ERROR_DOCUMENT_EXPIRY_BEFORE_ISSUE)


async def _store_object(*, key: str, upload: DocumentUpload) -> None:
    """boto3 is synchronous; keep its network call off the event loop."""
    await run_in_threadpool(
        storage_service.put_object,
        key,
        upload.data,
        content_type=upload.content_type,
    )


async def ensure_can_read(
    *, session: AsyncSession, current_user: User, document: EmployeeDocument
) -> None:
    """Use the same launch-category and employee scope as document lists."""
    access = await resolve_access(session, current_user, document.organisation_id)
    if not access.can_read(document):
        raise HRPermissionDeniedError(ERROR_DOCUMENT_READ_NOT_ALLOWED)


async def create_document(
    *,
    session: AsyncSession,
    current_user: User,
    payload: EmployeeDocumentCreate,
    upload: DocumentUpload,
) -> EmployeeDocument:
    require_permission(current_user=current_user, permission_key="hr.document.create")
    access = await resolve_access(session, current_user, payload.organisation_id)
    if payload.user_id not in access.create_users:
        raise HRPermissionDeniedError(ERROR_DOCUMENT_FILE_FOR_USER_NOT_ALLOWED)
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == payload.user_id,
            EmploymentRecord.organisation_id == access.organisation_id,
        )
    )
    if employment is None:
        raise HRValidationError(
            "Document subject must have employment in the selected organisation"
        )
    if payload.category not in LAUNCH_CATEGORIES:
        raise HRValidationError(
            "This document category is not available in this release"
        )
    if payload.entity_type is not None or payload.entity_id is not None:
        raise HRValidationError("Form attachments are not available in this release")

    if not payload.title.strip():
        raise HRValidationError("Document title cannot be blank")
    payload.title = payload.title.strip()
    _validate_upload(upload)
    _validate_dates(payload.issued_date, payload.expiry_date)

    document_id = uuid.uuid4()
    key = object_key_for(
        user_id=payload.user_id,
        document_id=document_id,
        extension=_extension_for(upload.content_type, upload.filename),
    )
    # Store first, commit second: a failed upload leaves no row, while a failed
    # commit leaves an unreferenced object. Orphaned bytes are recoverable;
    # a row pointing at nothing is not.
    await _store_object(key=key, upload=upload)

    document = EmployeeDocument(
        id=document_id,
        organisation_id=access.organisation_id,
        user_id=payload.user_id,
        category=payload.category,
        sensitivity=sensitivity_for(payload.category),
        title=payload.title,
        description=payload.description,
        object_key=key,
        original_filename=upload.filename,
        content_type=upload.content_type,
        size_bytes=len(upload.data),
        issued_date=payload.issued_date,
        expiry_date=payload.expiry_date,
        issuing_authority=payload.issuing_authority,
        reference_number=payload.reference_number,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        uploaded_by_user_id=current_user.id,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    logger.info(
        "Employee document stored",
        extra={
            "document_id": str(document.id),
            "subject_user_id": str(document.user_id),
            "category": document.category.value,
            "sensitivity": document.sensitivity.value,
            "uploaded_by": str(current_user.id),
        },
    )
    return document


async def get_document(
    *, session: AsyncSession, current_user: User, document_id: uuid.UUID
) -> EmployeeDocument:
    document = await session.get(EmployeeDocument, document_id)
    if not document:
        raise EmployeeDocumentNotFoundError()
    await ensure_can_read(session=session, current_user=current_user, document=document)
    return document


async def list_documents(
    *,
    session: AsyncSession,
    current_user: User,
    user_id: uuid.UUID | None = None,
    department_id: str | None = None,
    organisation_id: str | None = None,
    category: DocumentCategory | None = None,
    include_archived: bool = False,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[EmployeeDocument], int]:
    access = await resolve_access(session, current_user, organisation_id)
    statement = select(EmployeeDocument).where(
        EmployeeDocument.organisation_id == access.organisation_id,
        col(EmployeeDocument.category).in_(LAUNCH_CATEGORIES),
        col(EmployeeDocument.sensitivity) == DocumentSensitivity.STANDARD,
        or_(
            col(EmployeeDocument.user_id) == current_user.id,
            col(EmployeeDocument.user_id).in_(access.manage_users),
            and_(
                col(EmployeeDocument.user_id).in_(access.read_users),
                col(EmployeeDocument.category).in_(SUPERVISOR_CATEGORIES),
            ),
        ),
    )
    if department_id:
        require_permission(
            current_user=current_user, permission_key="hr.document.read.department"
        )
        statement = statement.where(
            col(EmployeeDocument.user_id).in_(
                select(EmploymentRecord.user_id).where(
                    col(EmploymentRecord.department_id) == department_id
                )
            )
        )
    if user_id:
        if user_id != current_user.id and user_id not in access.read_users:
            raise HRPermissionDeniedError(ERROR_DOCUMENT_READ_NOT_ALLOWED)
        statement = statement.where(col(EmployeeDocument.user_id) == user_id)
    elif not department_id:
        statement = statement.where(col(EmployeeDocument.user_id) == current_user.id)

    if category:
        statement = statement.where(col(EmployeeDocument.category) == category)
    if not include_archived:
        statement = statement.where(col(EmployeeDocument.archived_at).is_(None))

    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(col(EmployeeDocument.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def download_url(
    *, session: AsyncSession, current_user: User, document_id: uuid.UUID
) -> str:
    document = await get_document(
        session=session, current_user=current_user, document_id=document_id
    )
    # Presigning is local signing, no network call — safe to await directly.
    url = storage_service.presigned_download_url(
        document.object_key, expires_in=DOWNLOAD_URL_EXPIRY_SECONDS
    )
    logger.info(
        "Employee document download issued",
        extra={
            "document_id": str(document.id),
            "requested_by": str(current_user.id),
        },
    )
    return url


async def update_document(
    *,
    session: AsyncSession,
    current_user: User,
    document_id: uuid.UUID,
    payload: EmployeeDocumentUpdate,
) -> EmployeeDocument:
    document = await session.get(EmployeeDocument, document_id)
    if not document:
        raise EmployeeDocumentNotFoundError()
    await _ensure_can_manage(
        session=session, current_user=current_user, document=document
    )

    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields:
        if not fields["title"] or not fields["title"].strip():
            raise HRValidationError("Document title cannot be blank")
        fields["title"] = fields["title"].strip()
    _validate_dates(
        fields.get("issued_date", document.issued_date),
        fields.get("expiry_date", document.expiry_date),
    )
    for field, value in fields.items():
        setattr(document, field, value)
    document.updated_at = utc_now()
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


async def archive_document(
    *, session: AsyncSession, current_user: User, document_id: uuid.UUID
) -> EmployeeDocument:
    document = await session.get(EmployeeDocument, document_id)
    if not document:
        raise EmployeeDocumentNotFoundError()
    await _ensure_can_manage(
        session=session, current_user=current_user, document=document
    )
    if document.archived_at is None:
        document.archived_at = utc_now()
        document.archived_by_user_id = current_user.id
        document.updated_at = utc_now()
        session.add(document)
        await session.commit()
        await session.refresh(document)
        logger.info(
            "Employee document archived",
            extra={
                "document_id": str(document.id),
                "archived_by": str(current_user.id),
            },
        )
    return document


async def _ensure_can_manage(
    *, session: AsyncSession, current_user: User, document: EmployeeDocument
) -> None:
    access = await resolve_access(session, current_user, document.organisation_id)
    if not access.can_manage(document):
        raise HRPermissionDeniedError(ERROR_DOCUMENT_MANAGE_NOT_ALLOWED)


async def list_document_employees(
    *,
    session: AsyncSession,
    current_user: User,
    search: str,
    organisation_id: str | None = None,
    skip: int,
    limit: int,
) -> tuple[list[tuple[User, str]], int]:
    access = await resolve_access(session, current_user, organisation_id)
    query = (
        select(User, EmploymentRecord.department_id)
        .join(EmploymentRecord, col(EmploymentRecord.user_id) == User.id)
        .where(
            EmploymentRecord.organisation_id == access.organisation_id,
            col(User.id).in_(access.read_users | {current_user.id}),
        )
    )
    if search.strip():
        query = query.where(
            func.concat(User.first_name, " ", User.last_name).icontains(
                search.strip(), autoescape=True
            )
        )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await session.execute(
            query.order_by(col(User.last_name), col(User.first_name), col(User.id))
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [(user, department) for user, department in rows], count or 0
