from typing import Any

from fastapi import APIRouter

from src.dependencies import AccountUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, NOT_FOUND
from src.organisations.dependencies import OrgMember

from . import service
from .models import MembershipRole, MembershipStatus
from .schemas import (
    CurrentOrganisationPublic,
    MyMembershipPublic,
    OrganisationSummary,
)

router = APIRouter(prefix="/organisations", tags=["organisations"])


@router.get(
    "/mine",
    response_model=list[MyMembershipPublic],
    status_code=200,
    summary="List my organisations",
    description=(
        "The signed-in person's active organisation memberships, each with an "
        "organisation summary, ordered by organisation name."
    ),
    responses={**AUTHENTICATED},
)
async def list_mine(*, session: SessionDep, current_user: AccountUser) -> Any:
    rows = await service.list_my_memberships(session, current_user.id)
    return [
        MyMembershipPublic(
            membership_id=membership.id,
            role=MembershipRole(membership.role),
            status=MembershipStatus(membership.status),
            joined_at=membership.created_at,
            organisation=OrganisationSummary.model_validate(
                organisation, from_attributes=True
            ),
        )
        for membership, organisation in rows
    ]


@router.get(
    "/current",
    response_model=CurrentOrganisationPublic,
    status_code=200,
    summary="Read the active organisation",
    description=(
        "The organisation named by the X-Barrels-Organisation header and the "
        "caller's role in it. 400 when the header is missing; 404 when the "
        "organisation is unknown or the caller is not an active member; 403 "
        "when the organisation is suspended."
    ),
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def get_current(*, context: OrgMember) -> Any:
    return CurrentOrganisationPublic(
        organisation=OrganisationSummary.model_validate(
            context.organisation, from_attributes=True
        ),
        role=context.role,
    )
