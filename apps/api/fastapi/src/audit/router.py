from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginatedResponse, PaginationDep

from . import service
from .schemas import AuditEntryPublic

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "/{entity_type}/{entity_id}",
    response_model=PaginatedResponse[AuditEntryPublic],
    summary="Read a record's change history",
    description=(
        "Field-level change history, newest first. Visible to anyone who may read "
        "the record itself; values of sensitive fields are masked unless the reader "
        "holds audit.view_sensitive."
    ),
    responses={
        403: {"description": "Not allowed to read this record"},
        404: {"description": "No history is kept for this kind of record"},
    },
)
async def read_history(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    entity_type: str,
    entity_id: str,
) -> Any:
    return await service.list_history(
        session=session,
        actor=current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        page=pagination.page,
        size=pagination.size,
    )
