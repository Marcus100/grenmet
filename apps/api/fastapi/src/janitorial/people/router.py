from typing import Any
from uuid import UUID

from fastapi import APIRouter, status

from src.auth.browser import BrowserUser
from src.dependencies import SessionDep
from src.janitorial.dependencies import JanitorialSession
from src.janitorial.responses import FORBIDDEN, UNAVAILABLE, WRITE

from . import schemas, service

router = APIRouter(tags=["janitorial"])


@router.get(
    "/staff",
    response_model=schemas.JanitorialStaffList,
    summary="List the contractor and cleaning staff",
    description="Returns the cleaning contractor(s) and staff, with names and emails from Barrels Login.",
    responses={**FORBIDDEN, **UNAVAILABLE},
)
async def list_staff(
    *, user: BrowserUser, session: JanitorialSession, main: SessionDep
) -> Any:
    return await service.staff_list(session, main, user)


@router.post(
    "/contractors",
    response_model=schemas.JanitorialContractor,
    status_code=status.HTTP_201_CREATED,
    summary="Add a cleaning contractor",
    description="Registers the company that supplies cleaning staff.",
    responses=WRITE,
)
async def create_contractor(
    *, user: BrowserUser, session: JanitorialSession, payload: schemas.ContractorCreate
) -> Any:
    return await service.create_contractor(session, user, payload)


@router.patch(
    "/contractors/{contractor_id}",
    response_model=schemas.JanitorialContractor,
    summary="Update a cleaning contractor",
    description="Renames or (de)activates a contractor. Send the revision you last read.",
    responses=WRITE,
)
async def update_contractor(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    contractor_id: UUID,
    payload: schemas.ContractorUpdate,
) -> Any:
    return await service.update_contractor(session, user, contractor_id, payload)


@router.post(
    "/staff",
    response_model=schemas.JanitorialStaffMember,
    status_code=status.HTTP_201_CREATED,
    summary="Add a staff member",
    description="Adds a cleaner or contractor supervisor by their Barrels Login email. The account must already exist; grant the janitor app role separately.",
    responses=WRITE,
)
async def create_staff(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    main: SessionDep,
    payload: schemas.StaffCreate,
) -> Any:
    return await service.create_staff(session, main, user, payload)


@router.patch(
    "/staff/{staff_id}",
    response_model=schemas.JanitorialStaffMember,
    summary="Update a staff member",
    description="Changes a staff member's contractor, role, badge number or active state. Send the revision you last read.",
    responses=WRITE,
)
async def update_staff(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    main: SessionDep,
    staff_id: UUID,
    payload: schemas.StaffUpdate,
) -> Any:
    return await service.update_staff(session, main, user, staff_id, payload)


@router.get(
    "/grants",
    response_model=list[schemas.JanitorialGrant],
    summary="List building grants",
    description="Active building grants that scope what GAA supervisors and managers may see and manage.",
    responses={**FORBIDDEN, **UNAVAILABLE},
)
async def list_grants(
    *, user: BrowserUser, session: JanitorialSession, main: SessionDep
) -> Any:
    return await service.grants(session, main, user)


@router.post(
    "/grants",
    response_model=list[schemas.JanitorialGrant],
    status_code=status.HTTP_201_CREATED,
    summary="Grant buildings to a person",
    description="Grants each listed building to a Barrels Login user. Buildings already granted are skipped; the new grants are returned.",
    responses=WRITE,
)
async def create_grants(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    main: SessionDep,
    payload: schemas.GrantCreate,
) -> Any:
    return await service.create_grants(session, main, user, payload)


@router.post(
    "/grants/{grant_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a building grant",
    description="Ends a building grant. The grant is kept in history.",
    responses=WRITE,
)
async def revoke_grant(
    *, user: BrowserUser, session: JanitorialSession, grant_id: UUID
) -> None:
    await service.revoke_grant(session, user, grant_id)
