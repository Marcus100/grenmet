import uuid

from fastapi import APIRouter, Response

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep

from . import service
from .models import SavedSignature
from .schemas import (
    SignatureInput,
    SignaturePublic,
    SignedDocumentList,
    SignedDocumentPublic,
)

router = APIRouter(prefix="/hr", tags=["hr-signatures"])


@router.get(
    "/signature/me",
    response_model=SignaturePublic | None,
    status_code=200,
    summary="Read my saved signature",
    description="Returns only the authenticated user's saved signature.",
    responses={
        401: {"description": "Authentication required"},
        400: {"description": "Invalid signature"},
    },
)
async def read_my_signature(
    *, session: SessionDep, current_user: CurrentUser, response: Response
) -> SignaturePublic | None:
    response.headers["Cache-Control"] = "private, no-store"
    saved = await session.get(SavedSignature, current_user.id)
    return service.public_signature(saved) if saved else None


@router.put(
    "/signature/me",
    response_model=SignaturePublic,
    status_code=200,
    summary="Save my signature",
    description="Creates or replaces your private PNG signature. Previously signed documents remain unchanged.",
    responses={
        401: {"description": "Authentication required"},
        400: {"description": "Invalid signature"},
    },
)
async def save_my_signature(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: SignatureInput,
    response: Response,
) -> SignaturePublic:
    response.headers["Cache-Control"] = "private, no-store"
    return service.public_signature(
        await service.save_signature(session, current_user, payload.image_data_url)
    )


@router.delete(
    "/signature/me",
    response_model=None,
    status_code=204,
    summary="Delete my saved signature",
    description="Deletes the reusable signature, retaining existing signed documents.",
    responses={
        401: {"description": "Authentication required"},
        400: {"description": "Invalid signature"},
    },
)
async def delete_my_signature(
    *, session: SessionDep, current_user: CurrentUser
) -> None:
    await service.delete_signature(session, current_user)


@router.get(
    "/signed-documents/me",
    response_model=SignedDocumentList,
    status_code=200,
    summary="List my signed documents",
    description="Lists permanent signed submissions you signed or that concern you.",
    responses={
        401: {"description": "Authentication required"},
        400: {"description": "Invalid signature"},
    },
)
async def read_my_signed_documents(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    response: Response,
) -> SignedDocumentList:
    response.headers["Cache-Control"] = "private, no-store"
    rows, count = await service.list_documents(
        session, current_user, pagination.skip, pagination.limit
    )
    return SignedDocumentList(
        data=[
            SignedDocumentPublic.model_validate(row, from_attributes=True)
            for row in rows
        ],
        count=count,
    )


@router.get(
    "/signed-documents/{document_id}/pdf",
    response_model=None,
    status_code=200,
    summary="Download a signed HR document",
    description="Returns the original PDF to its signer, subject, or an HR document reader with scope over the subject.",
    responses={
        200: {"content": {"application/pdf": {}}, "description": "Original signed PDF"},
        403: {"description": "Not allowed"},
        404: {"description": "Not found"},
    },
)
async def download_signed_document(
    *, session: SessionDep, current_user: CurrentUser, document_id: uuid.UUID
) -> Response:
    record = await service.get_document(session, current_user, document_id)
    return Response(
        record.pdf,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="signed-{record.entity_type}-{record.entity_id}.pdf"',
        },
    )
