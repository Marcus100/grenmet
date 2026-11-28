"""Organisation-scoped uploads (F8): presign, confirm, and read.

Flow: ``create_upload`` records a pending row and returns a presigned PUT whose
signature covers Content-Type and Content-Length, so storage itself rejects a
different type or size. ``complete_upload`` HEADs the object and only then marks
it complete. Reads never expose bucket URLs: members get a short presigned GET,
and purposes flagged public are served through a cached redirect by file id.

Completion copies the bytes to a new key that the server picks. No presigned URL is
ever issued for that key, so a presigned PUT (valid for 15 minutes) can still overwrite
the original key but never the served object (#1679). The row is pointed at the copy,
and the router deletes the original on a best-effort basis after the commit, so a failed
commit leaves the row pointing at an object that still exists. Completion holds a row
lock until the commit, so concurrent calls write one copy. Only the bytes read and
validated at completion are copied, so a swap between the HEAD and the GET is never
served.

Service functions flush and never commit; the router owns the transaction.
Pixel limits apply only where a purpose sets ``strip_metadata``: those images are
decoded by Pillow at completion (``image_metadata.py``) and refused above the purpose's
``max_pixels`` (per purpose), re-encoded without their metadata, and refused when the
bytes are not the image type they declared. Any failure there deletes the object and
answers 422.
"""

import functools
import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import apps as auth_apps
from src.database import async_session_factory
from src.exceptions import AppException, NotFoundError
from src.organisations import entitlements, grants
from src.organisations import service as org_service
from src.storage import image_metadata, transitions
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
logger = logging.getLogger(__name__)
UPLOAD_TTL = timedelta(minutes=15)
PRIVATE_READ_SECONDS = 300
PUBLIC_REDIRECT_SECONDS = 300
#: Browsers/CDNs may reuse the public redirect for less than the signed URL lives.
PUBLIC_CACHE_SECONDS = 120


#: Decoded-size caps (width times height, in pixels) for the metadata step. A booking
#: logo is shown at 40 to 64 pixels, so 4 megapixels is generous. Organiser logos keep
#: the 16 megapixels they had before the metadata step (phone photos of 3000 by 2000
#: pixels and more are accepted). Pillow's decompression-bomb guard stays on in both.
BOOKING_LOGO_MAX_PIXELS = 4_000_000
#: A home page cover is a wide photo shown across a card; 8 megapixels is generous.
BOOKING_COVER_MAX_PIXELS = 8_000_000
#: A gallery photograph of the business's work is shown in a strip on its booking
#: page, no larger than a cover, so it keeps the cover's cap.
BOOKING_GALLERY_MAX_PIXELS = BOOKING_COVER_MAX_PIXELS
ORGANISER_LOGO_MAX_PIXELS = 16_000_000
#: Operational photos (log entries, incidents) are phone photos: 12 megapixels is the
#: usual size, 24 leaves room for larger sensors without unbounded decoding.
OPS_PHOTO_MAX_PIXELS = 24_000_000


@dataclass(frozen=True)
class Purpose:
    app: str
    max_bytes: int
    #: Public purposes are served unauthenticated by file id (marketing images).
    public: bool
    #: Re-encode the image without its metadata (EXIF location, camera serial) when the
    #: upload completes. The served copy is the re-encoded one (see the module docstring).
    strip_metadata: bool = False
    #: Decoded-size cap for the metadata step (width times height, in pixels).
    max_pixels: int = ORGANISER_LOGO_MAX_PIXELS
    #: The product key a member needs to read a file of this purpose through
    #: ``GET /storage/files/{id}``. Set for files a platform product owns, whose ids
    #: only appear inside records a member may read; without it, a member who has
    #: since lost the key (or never had it) could still fetch a file whose id they
    #: once saw. ``None`` keeps the organisation-member rule (Events and Bookings).
    read_key: str | None = None


PURPOSES: dict[str, Purpose] = {
    "organiser-logo": Purpose(
        app="events",
        max_bytes=2 * 1024 * 1024,
        public=True,
        strip_metadata=True,
        max_pixels=ORGANISER_LOGO_MAX_PIXELS,
    ),
    "listing-image": Purpose(app="events", max_bytes=5 * 1024 * 1024, public=True),
    "booking-logo": Purpose(
        app="bookings",
        max_bytes=2 * 1024 * 1024,
        public=True,
        strip_metadata=True,
        max_pixels=BOOKING_LOGO_MAX_PIXELS,
    ),
    "booking-cover": Purpose(
        app="bookings",
        max_bytes=5 * 1024 * 1024,
        public=True,
        strip_metadata=True,
        max_pixels=BOOKING_COVER_MAX_PIXELS,
    ),
    "booking-gallery": Purpose(
        app="bookings",
        max_bytes=5 * 1024 * 1024,
        public=True,
        strip_metadata=True,
        max_pixels=BOOKING_GALLERY_MAX_PIXELS,
    ),
    # Airport operations (ADR-0067): private evidence photos. Metadata is stripped
    # (a phone photo carries its GPS position and camera serial); the place is
    # recorded as text on the record instead.
    "opslog-photo": Purpose(
        app="opslog",
        max_bytes=10 * 1024 * 1024,
        public=False,
        strip_metadata=True,
        max_pixels=OPS_PHOTO_MAX_PIXELS,
        read_key="opslog.entries.read",
    ),
    "incident-photo": Purpose(
        app="incidents",
        max_bytes=10 * 1024 * 1024,
        public=False,
        strip_metadata=True,
        max_pixels=OPS_PHOTO_MAX_PIXELS,
        read_key="incidents.incidents.read",
    ),
}


class UploadsNotConfiguredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Uploads are not configured", status.HTTP_503_SERVICE_UNAVAILABLE
        )
        self.extra["code"] = "UPLOADS_NOT_CONFIGURED"


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
    if body.app != purpose.app or not (
        auth_apps.is_registered(body.app) or body.app in entitlements.PRODUCTS
    ):
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
    if not auth_apps.is_registered(body.app):
        # A platform product has no sign-in of its own; the organisation must hold it.
        await org_service.require_app_enabled(
            session, organisation_id=context.org.organisation_id, app_key=body.app
        )
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
    session: AsyncSession,
    organisation_id: str,
    upload_id: uuid.UUID,
    *,
    lock: bool = False,
) -> OrgUpload:
    statement = select(OrgUpload).where(
        OrgUpload.id == upload_id, OrgUpload.organisation_id == organisation_id
    )
    if lock:
        # Held until the router commits: a concurrent completion waits here, then
        # reads the row as complete and writes nothing.
        statement = statement.with_for_update()
    row = await session.scalar(statement)
    if row is None:
        raise NotFoundError("File not found")
    return row


def _served_bytes(row: OrgUpload, raw: bytes, purpose: Purpose | None) -> bytes:
    """The bytes to serve: stripped and re-encoded, or checked as the declared type.

    Raises ``ImageRejectedError`` when the bytes are not that image type.
    """
    if purpose is not None and purpose.strip_metadata:
        return image_metadata.strip_metadata(
            raw, row.content_type, max_pixels=purpose.max_pixels
        )
    if not image_metadata.has_type_signature(raw, row.content_type):
        raise image_metadata.ImageRejectedError(
            "The file is not the image type that was requested"
        )
    return raw


async def discard_superseded_object(key: str) -> None:
    """Delete the original object after the row has moved to its served copy.

    Called by the router after the commit, so a failed commit leaves the row pointing
    at a key that still exists. Best effort: a leftover object is never served. Logs
    the area only, never the key or the content.
    """
    try:
        await run_in_threadpool(storage.storage_service.delete_object, key)
    except BotoCoreError, ClientError:
        logger.warning(
            "Could not delete a completed upload's original object",
            extra={"area": "storage"},
        )


async def complete_upload(
    session: AsyncSession, context: UploadContext, upload_id: uuid.UUID
) -> tuple[OrgUpload, str | None]:
    """Complete an upload. Returns the row and the original key to discard once the
    router has committed (``None`` when there is nothing to discard)."""
    _require_configured()
    row = await _own_upload(session, context.org.organisation_id, upload_id, lock=True)
    if context.token_app is not None and context.token_app != row.app:
        raise UploadAppError()
    if row.status == UploadStatus.COMPLETE.value:
        return row, None
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
    # The bytes validated here are the bytes copied below. The original key stays
    # writable through the presigned PUT until it expires, so a body read earlier
    # could differ from one read now; only this read is ever served.
    raw = await run_in_threadpool(storage.storage_service.get_object, row.object_key)
    purpose = PURPOSES.get(row.purpose)
    try:
        clean = await run_in_threadpool(
            functools.partial(_served_bytes, row, raw, purpose)
        )
    except image_metadata.ImageRejectedError as error:
        await run_in_threadpool(storage.storage_service.delete_object, row.object_key)
        raise UploadRejectedError(str(error)) from error
    _, served_key = object_key(
        row.organisation_id, row.app, row.purpose, IMAGE_TYPES[row.content_type]
    )
    await run_in_threadpool(
        functools.partial(
            storage.storage_service.put_object,
            served_key,
            clean,
            content_type=row.content_type,
        )
    )
    superseded_key = row.object_key
    row.object_key = served_key
    row.size_bytes = len(clean)
    transitions.move_upload(row, "complete")
    row.completed_at = utc_now()
    await session.flush()
    return row, superseded_key


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
    purpose = PURPOSES.get(row.purpose)
    # An upload whose purpose is no longer known is refused, as `public_read_url` does:
    # if a purpose were ever removed or renamed, its private files must not fall back to
    # "any member of the organisation".
    if purpose is None:
        raise NotFoundError("File not found")
    if purpose.read_key is not None and not await grants.has_org_permission(
        session, membership=context.org.membership, permission_key=purpose.read_key
    ):
        # 404, not 403: the same answer as a file that is not there, so a member
        # who lost the key learns nothing about whether the file exists.
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


async def lock_usable(
    session: AsyncSession,
    file_id: uuid.UUID,
    *,
    organisation_id: str,
    purpose: str,
) -> bool:
    """``file_is_usable`` on the caller's own transaction, with the row locked
    (``FOR SHARE``) until that transaction ends.

    A caller that stores a reference to a ``booking-*`` upload must use this and write
    the reference in the same transaction: the sweep (``src/storage/sweep.py``) cannot
    delete a locked file, and a deleted file is not found here.
    """
    found = await session.scalar(
        select(OrgUpload.id)
        .where(
            OrgUpload.id == file_id,
            OrgUpload.organisation_id == organisation_id,
            OrgUpload.purpose == purpose,
            OrgUpload.status == UploadStatus.COMPLETE.value,
        )
        .with_for_update(read=True)
    )
    return found is not None


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
