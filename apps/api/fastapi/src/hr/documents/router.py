import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep
from src.storage.service import StorageNotConfiguredError

from . import service
from .access import resolve_access
from .models import DocumentCategory, EmployeeDocument
from .schemas import (
    DocumentEmployeeListPublic,
    DocumentEmployeePublic,
    DocumentUpload,
    EmployeeDocumentCreate,
    EmployeeDocumentListPublic,
    EmployeeDocumentPublic,
    EmployeeDocumentUpdate,
)

router = APIRouter(prefix="/hr", tags=["hr-documents"])

_STORAGE_UNAVAILABLE = "Document storage is not configured"


async def _document_public(
    session: AsyncSession, user: User, document: EmployeeDocument
) -> EmployeeDocumentPublic:
    access = await resolve_access(session, user, document.organisation_id)
    return EmployeeDocumentPublic.model_validate(
        document, from_attributes=True
    ).model_copy(update={"can_manage": access.can_manage(document)})


@router.post(
    "/documents",
    response_model=EmployeeDocumentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an employee document",
    description=(
        "Upload a document against a person as multipart/form-data. Requires "
        "hr.document.create; filing against another person additionally requires "
        "scoped hr.document.manage over them. Only the six launch categories are accepted; "
        "confidential categories and form attachments are deferred."
    ),
    responses={
        status.HTTP_201_CREATED: {"description": "Document stored"},
        status.HTTP_400_BAD_REQUEST: {"description": "Rejected file or date range"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Storage not configured"},
    },
)
async def upload_document(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(description="The document to store")],
    user_id: Annotated[uuid.UUID, Form()],
    title: Annotated[str, Form(min_length=1, max_length=255)],
    organisation_id: Annotated[str | None, Form()] = None,
    category: Annotated[DocumentCategory, Form()] = DocumentCategory.OTHER,
    description: Annotated[str | None, Form(max_length=2000)] = None,
    issued_date: Annotated[date | None, Form()] = None,
    expiry_date: Annotated[date | None, Form()] = None,
    issuing_authority: Annotated[str | None, Form(max_length=255)] = None,
    reference_number: Annotated[str | None, Form(max_length=120)] = None,
    entity_type: Annotated[str | None, Form()] = None,
    entity_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Any:
    payload = EmployeeDocumentCreate(
        user_id=user_id,
        organisation_id=organisation_id,
        category=category,
        title=title,
        description=description,
        issued_date=issued_date,
        expiry_date=expiry_date,
        issuing_authority=issuing_authority,
        reference_number=reference_number,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    upload = DocumentUpload(
        filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream",
        data=await file.read(service.MAX_DOCUMENT_BYTES + 1),
    )
    try:
        document = await service.create_document(
            session=session,
            current_user=current_user,
            payload=payload,
            upload=upload,
        )
        return await _document_public(session, current_user, document)
    except StorageNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_STORAGE_UNAVAILABLE,
        ) from None


@router.get(
    "/documents",
    response_model=EmployeeDocumentListPublic,
    summary="List employee documents",
    description=(
        "List documents (own by default). A user_id or department_id filter requires "
        "scoped authority over the target. Supervisors see credentials only; scoped "
        "document managers see personnel documents. Deferred categories are omitted."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Documents returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_documents(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    user_id: uuid.UUID | None = None,
    department_id: str | None = None,
    organisation_id: str | None = None,
    category: DocumentCategory | None = None,
    include_archived: bool = False,
) -> Any:
    rows, total = await service.list_documents(
        session=session,
        current_user=current_user,
        user_id=user_id,
        department_id=department_id,
        organisation_id=organisation_id,
        category=category,
        include_archived=include_archived,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    access = await resolve_access(session, current_user, organisation_id)
    return EmployeeDocumentListPublic(
        can_upload=(user_id or current_user.id) in access.create_users,
        data=[
            EmployeeDocumentPublic.model_validate(row, from_attributes=True).model_copy(
                update={"can_manage": access.can_manage(row)}
            )
            for row in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/document-employees",
    response_model=DocumentEmployeeListPublic,
    status_code=status.HTTP_200_OK,
    summary="List employees available in the document workspace",
    description="Only employees covered by active document read or management assignments are returned. Search and counts are scoped before pagination.",
    responses={status.HTTP_200_OK: {"description": "Scoped employee choices"}},
)
async def read_document_employees(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    search: Annotated[str, Query(max_length=100)] = "",
    organisation_id: str | None = None,
) -> DocumentEmployeeListPublic:
    access = await resolve_access(session, current_user, organisation_id)
    rows, count = await service.list_document_employees(
        session=session,
        current_user=current_user,
        search=search,
        organisation_id=organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return DocumentEmployeeListPublic(
        data=[
            DocumentEmployeePublic(
                user_id=user.id,
                name=user.full_name,
                department_id=department,
                can_upload=user.id in access.create_users,
            )
            for user, department in rows
        ],
        count=count or 0,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/documents/{document_id}",
    response_model=EmployeeDocumentPublic,
    summary="Get an employee document",
    description="Return a launch-category document within the same scope as document lists.",
    responses={
        status.HTTP_200_OK: {"description": "Document returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Document not found"},
    },
)
async def read_document(
    *, session: SessionDep, current_user: CurrentUser, document_id: uuid.UUID
) -> Any:
    document = await service.get_document(
        session=session, current_user=current_user, document_id=document_id
    )
    return await _document_public(session, current_user, document)


@router.get(
    "/documents/{document_id}/download",
    response_class=RedirectResponse,
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    summary="Download an employee document",
    description=(
        "Redirect to a short-lived presigned download URL. The access check runs on "
        "every request, so the link cannot be shared as a standing grant."
    ),
    responses={
        status.HTTP_307_TEMPORARY_REDIRECT: {"description": "Redirect to storage"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Document not found"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Storage not configured"},
    },
)
async def download_document(
    *, session: SessionDep, current_user: CurrentUser, document_id: uuid.UUID
) -> RedirectResponse:
    try:
        url = await service.download_url(
            session=session, current_user=current_user, document_id=document_id
        )
    except StorageNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_STORAGE_UNAVAILABLE,
        ) from None
    return RedirectResponse(
        url,
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={"Cache-Control": "private, no-store"},
    )


@router.patch(
    "/documents/{document_id}",
    response_model=EmployeeDocumentPublic,
    summary="Correct employee document metadata",
    description=(
        "Update correctable metadata. Requires hr.document.manage, or being the "
        "uploader of a document on their own record. Management is scoped. Category cannot be changed — re-file the document instead."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Document updated"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid date range"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Document not found"},
    },
)
async def patch_document(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    document_id: uuid.UUID,
    payload: EmployeeDocumentUpdate,
) -> Any:
    document = await service.update_document(
        session=session,
        current_user=current_user,
        document_id=document_id,
        payload=payload,
    )
    return await _document_public(session, current_user, document)


@router.post(
    "/documents/{document_id}/archive",
    response_model=EmployeeDocumentPublic,
    summary="Archive an employee document",
    description=(
        "Archive a document. Requires scoped hr.document.manage, or being its subject and uploader. "
        "HR documents are never hard-deleted; the row and its file are retained."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Document archived"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Document not found"},
    },
)
async def archive_document(
    *, session: SessionDep, current_user: CurrentUser, document_id: uuid.UUID
) -> Any:
    document = await service.archive_document(
        session=session, current_user=current_user, document_id=document_id
    )
    return await _document_public(session, current_user, document)
