"""Organisation-scoped uploads (F8): presign, confirm, and read.

Flow: ``create_upload`` records a pending row and returns a presigned PUT whose
signature covers Content-Type and Content-Length, so storage itself rejects a
different type or size. ``complete_upload`` HEADs the object and only then marks
it complete. Reads never expose bucket URLs: members get a short presigned GET,
and purposes flagged public are served through a cached redirect by file id.

Service functions flush and never commit; the router owns the transaction.
Dimension checks are not done: Pillow is not a declared dependency.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from fastapi import status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import apps as auth_apps
from src.database import async_session_factory
from src.exceptions import AppException, NotFoundError
from src.storage import service as storage
from src.storage.dependencies import UploadContext
from src.storage.models import OrgUpload, UploadStatus
from src.storage.schemas import UploadRequest
from src.utils.datetime import utc_now

#: Accepted image types and the extension each is stored under.
IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
UPLOAD_TTL = timedelta(minutes=15)
PRIVATE_READ_SECONDS = 300
PUBLIC_REDIRECT_SECONDS = 300
#: Browsers/CDNs may reuse the public redirect for less than the signed URL lives.
PUBLIC_CACHE_SECONDS = 120


@dataclass(frozen=True)
class Purpose:
    app: str
    max_bytes: int
    #: Public purposes are served unauthenticated by file id (marketing images).
    public: bool


PURPOSES: dict[str, Purpose] = {
    "organiser-logo": Purpose(app="events", max_bytes=2 * 1024 * 1024, public=True),
    "listing-image": Purpose(app="events", max_bytes=5 * 1024 * 1024, public=True),
}


class UploadsNotConfiguredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Uploads are not configured", status.HTTP_503_SERVICE_UNAVAILABLE
        )


class UploadRejectedError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class UploadStateError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class UploadAppError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This sign-in cannot upload for that app", status.HTTP_403_FORBIDDEN
        )


def _require_configured() -> None:
    if not storage.storage_service.is_configured:
        raise UploadsNotConfiguredError()


def object_key(
    organisation_id: str, app: str, purpose: str, ext: str
) -> tuple[uuid.UUID, str]:
    upload_id = uuid.uuid4()
    return upload_id, f"org/{organisation_id}/{app}/{purpose}/{upload_id}.{ext}"


def validate_request(body: UploadRequest) -> Purpose:
    purpose = PURPOSES.get(body.purpose)
    if purpose is None:
        raise UploadRejectedError("Unknown upload purpose")
    if body.app != purpose.app or not auth_apps.is_registered(body.app):
        raise UploadRejectedError("That purpose does not belong to this app")
    if body.content_type not in IMAGE_TYPES:
        raise UploadRejectedError("Only JPEG, PNG and WebP images are accepted")
    if body.size_bytes > purpose.max_bytes:
        limit_mb = purpose.max_bytes // (1024 * 1024)
        raise UploadRejectedError(f"The file is larger than the {limit_mb} MB limit")
    return purpose


async def create_upload(
    session: AsyncSession, context: UploadContext, body: UploadRequest
) -> tuple[OrgUpload, str]:
    """Record a pending upload and return it with its presigned PUT URL."""
    _require_configured()
    validate_request(body)
    if context.token_app is not None and context.token_app != body.app:
        raise UploadAppError()
    upload_id, key = object_key(
        context.org.organisation_id,
        body.app,
        body.purpose,
        IMAGE_TYPES[body.content_type],
    )
    now = utc_now()
    row = OrgUpload(
        id=upload_id,
        organisation_id=context.org.organisation_id,
        app=body.app,
        purpose=body.purpose,
        object_key=key,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        status=UploadStatus.PENDING.value,
        created_by_user_id=context.user.id,
        created_at=now,
        expires_at=now + UPLOAD_TTL,
    )
    session.add(row)
    await session.flush()
    url = storage.storage_service.presigned_upload_url(
        key,
        content_type=body.content_type,
        content_length=body.size_bytes,
        expires_in=int(UPLOAD_TTL.total_seconds()),
    )
    return row, url


async def _own_upload(
    session: AsyncSession, organisation_id: str, upload_id: uuid.UUID
) -> OrgUpload:
    row = await session.scalar(
        select(OrgUpload).where(
            OrgUpload.id == upload_id, OrgUpload.organisation_id == organisation_id
        )
    )
    if row is None:
        raise NotFoundError("File not found")
    return row


async def complete_upload(
    session: AsyncSession, context: UploadContext, upload_id: uuid.UUID
) -> OrgUpload:
    _require_configured()
    row = await _own_upload(session, context.org.organisation_id, upload_id)
    if context.token_app is not None and context.token_app != row.app:
        raise UploadAppError()
    if row.status == UploadStatus.COMPLETE.value:
        return row
    if row.expires_at < utc_now():
        raise UploadStateError("The upload link expired; start the upload again")
    head = await run_in_threadpool(storage.storage_service.head_object, row.object_key)
    if head is None:
        raise UploadStateError("The file has not been uploaded yet")
    stored_type = str(head.get("ContentType") or "")
    if (
        int(head.get("ContentLength") or 0) != row.size_bytes
        or stored_type != row.content_type
    ):
        await run_in_threadpool(storage.storage_service.delete_object, row.object_key)
        raise UploadRejectedError("The uploaded file does not match what was requested")
    row.status = UploadStatus.COMPLETE.value
    row.completed_at = utc_now()
    await session.flush()
    return row


def public_path(row: OrgUpload) -> str | None:
    purpose = PURPOSES.get(row.purpose)
    if purpose is None or not purpose.public:
        return None
    return f"/api/v1/storage/public/{row.id}"


async def private_read_url(
    session: AsyncSession, context: UploadContext, file_id: uuid.UUID
) -> OrgUpload:
    row = await _own_upload(session, context.org.organisation_id, file_id)
    if row.status != UploadStatus.COMPLETE.value:
        raise NotFoundError("File not found")
    return row


async def public_read_url(session: AsyncSession, file_id: uuid.UUID) -> str:
    """Presigned GET for a completed file of a public purpose, else 404."""
    row = await session.get(OrgUpload, file_id)
    purpose = PURPOSES.get(row.purpose) if row is not None else None
    if (
        row is None
        or row.status != UploadStatus.COMPLETE.value
        or purpose is None
        or not purpose.public
    ):
        raise NotFoundError("File not found")
    return storage.storage_service.presigned_download_url(
        row.object_key, expires_in=PUBLIC_REDIRECT_SECONDS
    )


async def file_is_usable(
    file_id: uuid.UUID, *, organisation_id: str, purpose: str
) -> bool:
    """Whether ``file_id`` is a completed upload of ``purpose`` for this organisation.

    For other domains (Events) that store a file id without a cross-database key.
    """
    async with async_session_factory() as session:
        row = await session.get(OrgUpload, file_id)
    return (
        row is not None
        and row.organisation_id == organisation_id
        and row.purpose == purpose
        and row.status == UploadStatus.COMPLETE.value
    )
