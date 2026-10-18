"""Organisation-scoped uploads and file reads (F8). See ``uploads.py``."""

import uuid

from fastapi import APIRouter, status
from fastapi.responses import RedirectResponse

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, CONFLICT, NOT_FOUND, ResponseMap
from src.storage import service as storage
from src.storage import uploads
from src.storage.dependencies import UploadMember
from src.storage.models import OrgUpload
from src.storage.schemas import FileAccess, StoredFile, UploadRequest, UploadTicket

router = APIRouter(prefix="/storage", tags=["storage"])

_UNAVAILABLE: ResponseMap = {503: {"description": "Uploads are not configured"}}
_REJECTED: ResponseMap = {422: {"description": "Type, size or purpose not allowed"}}


def _stored(row: OrgUpload) -> StoredFile:
    return StoredFile(
        id=row.id,
        organisation_id=row.organisation_id,
        app=row.app,
        purpose=row.purpose,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        status="complete" if row.status == "complete" else "pending",
        public_path=uploads.public_path(row),
        created_at=row.created_at,
        completed_at=row.completed_at,
    )


@router.post(
    "/uploads",
    response_model=UploadTicket,
    status_code=status.HTTP_201_CREATED,
    summary="Start an organisation upload",
    description=(
        "Returns a short-lived presigned PUT for "
        "`org/{organisation}/{app}/{purpose}/{id}.{ext}`. The signature covers the "
        "content type and exact size. Send the bytes, then call `complete`."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND, **_REJECTED, **_UNAVAILABLE},
)
async def create_upload(
    session: SessionDep, context: UploadMember, body: UploadRequest
) -> UploadTicket:
    row, url = await uploads.create_upload(session, context, body)
    await session.commit()
    return UploadTicket(
        id=row.id,
        url=url,
        headers={"Content-Type": row.content_type},
        expires_at=row.expires_at,
        max_bytes=uploads.PURPOSES[row.purpose].max_bytes,
    )


@router.post(
    "/uploads/{upload_id}/complete",
    response_model=StoredFile,
    summary="Confirm an organisation upload",
    description="Checks the object exists with the declared type and size, then marks it complete.",
    responses={
        **AUTHENTICATED,
        **NOT_FOUND,
        **CONFLICT,
        **_REJECTED,
        **_UNAVAILABLE,
    },
)
async def complete_upload(
    session: SessionDep, context: UploadMember, upload_id: uuid.UUID
) -> StoredFile:
    try:
        row = await uploads.complete_upload(session, context, upload_id)
    except uploads.UploadRejectedError:
        # The mismatching object was deleted; keep the pending row for audit.
        await session.commit()
        raise
    await session.commit()
    return _stored(row)


@router.get(
    "/files/{file_id}",
    response_model=FileAccess,
    summary="Get a short-lived link to a file",
    description="Presigned GET for a completed file of the caller's organisation.",
    responses={**AUTHENTICATED, **NOT_FOUND, **_UNAVAILABLE},
)
async def get_file(
    session: SessionDep, context: UploadMember, file_id: uuid.UUID
) -> FileAccess:
    row = await uploads.private_read_url(session, context, file_id)
    if not storage.storage_service.is_configured:
        raise uploads.UploadsNotConfiguredError()
    url = storage.storage_service.presigned_download_url(
        row.object_key, expires_in=uploads.PRIVATE_READ_SECONDS
    )
    return FileAccess(url=url, expires_in=uploads.PRIVATE_READ_SECONDS)


@router.get(
    "/public/{file_id}",
    response_class=RedirectResponse,
    status_code=307,
    summary="Public image redirect",
    description=(
        "Unauthenticated, cached redirect for completed files of public purposes "
        "(organiser logos, listing images). Other files are 404."
    ),
    responses={**NOT_FOUND, **_UNAVAILABLE},
)
async def public_file(session: SessionDep, file_id: uuid.UUID) -> RedirectResponse:
    if not storage.storage_service.is_configured:
        raise uploads.UploadsNotConfiguredError()
    url = await uploads.public_read_url(session, file_id)
    return RedirectResponse(
        url,
        status_code=307,
        headers={"Cache-Control": f"public, max-age={uploads.PUBLIC_CACHE_SECONDS}"},
    )
