import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import AwareDatetime

from src.auth.policy import require_permission
from src.dependencies import CurrentUser, SessionDep
from src.models import ApiError
from src.pagination import PaginatedResponse, PaginationDep

from . import service
from .schemas import AuditEntryAdminPage, AuditEntryPublic

router = APIRouter(prefix="/audit", tags=["audit"])


# Declared before ``/{entity_type}/{entity_id}``: FastAPI matches in declaration
# order, and "admin" would otherwise read as an entity type.
@router.get(
    "/admin/entries",
    response_model=AuditEntryAdminPage,
    summary="Read the global audit log",
    description=(
        "Every change history entry, newest first, for the admin audit screen. "
        "Needs audit.entries.read. Filter by actor, action, entity type, "
        "organisation and created_from/created_to (timezone-aware). Pages are "
        "keyset: pass next_cursor back as cursor. Values of sensitive fields are "
        "masked unless the reader holds audit.view_sensitive. Read-only."
    ),
    responses={
        403: {"model": ApiError, "description": "Missing audit.entries.read"},
    },
)
async def list_admin_audit_entries(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    actor_id: uuid.UUID | None = None,
    action: Annotated[str | None, Query(max_length=20)] = None,
    entity_type: Annotated[str | None, Query(max_length=60)] = None,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
    created_from: AwareDatetime | None = None,
    created_to: AwareDatetime | None = None,
    cursor: Annotated[str | None, Query(max_length=500)] = None,
    limit: Annotated[
        int, Query(ge=1, le=service.ADMIN_MAX_LIMIT)
    ] = service.ADMIN_DEFAULT_LIMIT,
) -> Any:
    require_permission(
        current_user=current_user, permission_key=service.ADMIN_READ_PERMISSION
    )
    return await service.list_admin_entries(
        session=session,
        actor=current_user,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        organisation_id=organisation_id,
        created_from=created_from,
        created_to=created_to,
        cursor=cursor,
        limit=limit,
    )


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
        403: {"model": ApiError, "description": "Not allowed to read this record"},
        404: {
            "model": ApiError,
            "description": "No history is kept for this kind of record",
        },
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
