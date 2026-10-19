import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, CONFLICT, NOT_FOUND
from src.organisations.models import MembershipRole

from . import service
from .dependencies import (
    GuidanceMember,
    GuidanceOrgMember,
    GuidanceReader,
    GuidanceReviewer,
)
from .schemas import (
    AccessRequestCreate,
    AccessRequestDecide,
    AccessRequestPublic,
    AccessStatusPublic,
    GuidanceCatalogue,
    GuidanceModel,
    GuidanceOrganisationPublic,
    MeteogramPublic,
)

router = APIRouter(prefix="/models", tags=["models-guidance"])

_READER = (
    "Caller is a member of an organisation entitled to the GMS Dashboard "
    "(`X-Barrels-Organisation`), or GMS staff with `gmsdash.guidance.view`."
)


@router.get(
    "/catalogue",
    response_model=GuidanceCatalogue,
    summary="Forecast points and models with their latest stored run",
    description=f"Raw model guidance, not an official GMS forecast. {_READER}",
    responses=AUTHENTICATED,
)
async def get_catalogue(*, session: SessionDep, caller: GuidanceReader) -> Any:
    _ = caller
    return await service.get_catalogue(session)


@router.get(
    "/meteogram",
    response_model=MeteogramPublic,
    summary="Point meteogram from the latest stored model run",
    description=(
        "Time series for one point from one model's newest stored run, with the run "
        "time and the provider attribution. Raw model guidance, not an official GMS "
        f"forecast. {_READER}"
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_meteogram(
    *,
    session: SessionDep,
    caller: GuidanceReader,
    point: Annotated[str, Query(max_length=40, description="Point key, e.g. `mbia`.")],
    model: Annotated[GuidanceModel, Query(description="Model to read.")],
) -> Any:
    _ = caller
    return await service.get_meteogram(session, point_key=point, model=model)


@router.get(
    "/organisations",
    response_model=list[GuidanceOrganisationPublic],
    summary="The caller's organisations and their GMS Dashboard standing",
    description=(
        "Active memberships of the signed-in account (GMS Dashboard or account "
        "session) with entitlement and the latest access-request status."
    ),
    responses=AUTHENTICATED,
)
async def list_organisations(*, session: SessionDep, user: GuidanceMember) -> Any:
    return await service.list_my_organisations(session, user.id)


@router.get(
    "/access",
    response_model=AccessStatusPublic,
    summary="Whether the organisation has GMS Dashboard access, and its latest request",
    description="Any active member of the organisation named in `X-Barrels-Organisation`.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_access_status(*, session: SessionDep, org: GuidanceOrgMember) -> Any:
    return await service.get_access_status(session, org.organisation)


@router.post(
    "/access-requests",
    response_model=AccessRequestPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Ask GMS to enable the GMS Dashboard for the organisation",
    description=(
        "Admins and owners of the organisation named in `X-Barrels-Organisation`. "
        "Staff with `gmsdash.access.review` decide the request."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND, **CONFLICT},
)
async def create_access_request(
    *, session: SessionDep, org: GuidanceOrgMember, payload: AccessRequestCreate
) -> Any:
    org.require_role(MembershipRole.ADMIN)
    result = await service.create_access_request(
        session, organisation=org.organisation, user_id=org.user.id, note=payload.note
    )
    await session.commit()
    return result


@router.get(
    "/access-requests",
    response_model=list[AccessRequestPublic],
    summary="List organisation access requests (staff)",
    description="Requires `gmsdash.access.review`. Newest first, at most 200.",
    responses=AUTHENTICATED,
)
async def list_access_requests(
    *,
    session: SessionDep,
    reviewer: GuidanceReviewer,
    request_status: Annotated[
        str | None,
        Query(alias="status", pattern="^(pending|approved|rejected)$"),
    ] = None,
) -> Any:
    _ = reviewer
    return await service.list_access_requests(session, status=request_status)


@router.post(
    "/access-requests/{request_id}/decision",
    response_model=AccessRequestPublic,
    summary="Approve or reject an organisation access request (staff)",
    description=(
        "Requires `gmsdash.access.review`. Approval enables the `gmsdash` app "
        "entitlement for the organisation."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND, **CONFLICT},
)
async def decide_access_request(
    *,
    session: SessionDep,
    reviewer: GuidanceReviewer,
    request_id: uuid.UUID,
    payload: AccessRequestDecide,
) -> Any:
    result = await service.decide_access_request(
        session,
        request_id=request_id,
        decision=payload.decision,
        note=payload.note,
        reviewer_id=reviewer.id,
    )
    await session.commit()
    return result
