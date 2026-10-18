from typing import Any

from fastapi import APIRouter

from src.auth.models import User
from src.dependencies import AccountUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgAdmin, OrgMember
from src.pagination import PaginationDep

from . import members, service
from .exceptions import OrganisationNotFoundError
from .models import Membership, MembershipRole, MembershipStatus
from .schemas import (
    CurrentOrganisationPublic,
    InvitationAccept,
    InvitationCreate,
    InvitationPublic,
    MemberListPublic,
    MemberPublic,
    MemberRoleUpdate,
    MyMembershipPublic,
    OrganisationSummary,
)

router = APIRouter(prefix="/organisations", tags=["organisations"])

MANAGE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


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


# ── Membership management (F4) ───────────────────────────────────────────────


def _require_path_match(context: OrgAdmin, organisation_id: str) -> None:
    """The path must name the organisation the header resolved (no existence leak)."""
    if organisation_id != context.organisation_id:
        raise OrganisationNotFoundError()


def _member(membership: Membership, user: User) -> MemberPublic:
    return MemberPublic(
        membership_id=membership.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=MembershipRole(membership.role),
        joined_at=membership.created_at,
    )


@router.get(
    "/{organisation_id}/members",
    response_model=MemberListPublic,
    summary="List organisation members",
    description="Active members of the organisation. Admins and owners only.",
    responses=MANAGE_ERRORS,
)
async def list_members(
    *,
    session: SessionDep,
    context: OrgAdmin,
    organisation_id: str,
    pagination: PaginationDep,
) -> Any:
    _require_path_match(context, organisation_id)
    rows, total = await members.list_members(session, context, pagination)
    return MemberListPublic(
        data=[_member(m, u) for m, u in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.patch(
    "/{organisation_id}/members/{membership_id}",
    response_model=MemberPublic,
    summary="Change a member's role",
    description=(
        "Admins manage members and admins; only owners grant or change the owner "
        "role. 409 when it would leave the organisation without an owner."
    ),
    responses=MANAGE_ERRORS,
)
async def update_member(
    *,
    session: SessionDep,
    context: OrgAdmin,
    organisation_id: str,
    membership_id: str,
    payload: MemberRoleUpdate,
) -> Any:
    _require_path_match(context, organisation_id)
    membership, user = await members.change_role(
        session, context, membership_id, payload.role
    )
    result = _member(membership, user)
    await session.commit()
    return result


@router.delete(
    "/{organisation_id}/members/{membership_id}",
    status_code=204,
    summary="Remove a member",
    description=(
        "Ends the person's membership. Only owners remove owners; 409 when it "
        "would leave the organisation without an owner."
    ),
    responses=MANAGE_ERRORS,
)
async def delete_member(
    *,
    session: SessionDep,
    context: OrgAdmin,
    organisation_id: str,
    membership_id: str,
) -> None:
    _require_path_match(context, organisation_id)
    await members.remove_member(session, context, membership_id)
    await session.commit()


@router.get(
    "/{organisation_id}/invitations",
    response_model=list[InvitationPublic],
    summary="List pending invitations",
    description="Invitations that are not yet accepted, revoked or expired.",
    responses=MANAGE_ERRORS,
)
async def list_invitations(
    *, session: SessionDep, context: OrgAdmin, organisation_id: str
) -> Any:
    _require_path_match(context, organisation_id)
    return [
        InvitationPublic.model_validate(row, from_attributes=True)
        for row in await members.list_pending_invitations(session, context)
    ]


@router.post(
    "/{organisation_id}/invitations",
    response_model=InvitationPublic,
    status_code=201,
    summary="Invite someone to the organisation",
    description=(
        "Emails a single-use link, valid for 7 days. Admins invite members and "
        "admins; only owners invite owners. Inviting the same address again "
        "replaces the pending invitation. 409 when the person is already a member."
    ),
    responses=MANAGE_ERRORS,
)
async def create_invitation(
    *,
    session: SessionDep,
    context: OrgAdmin,
    organisation_id: str,
    payload: InvitationCreate,
) -> Any:
    _require_path_match(context, organisation_id)
    invitation = await members.invite(
        session, context, email=payload.email, role=payload.role
    )
    result = InvitationPublic.model_validate(invitation, from_attributes=True)
    await session.commit()
    return result


@router.delete(
    "/{organisation_id}/invitations/{invitation_id}",
    status_code=204,
    summary="Revoke an invitation",
    description="The link stops working. 409 when it was already accepted.",
    responses=MANAGE_ERRORS,
)
async def revoke_invitation(
    *,
    session: SessionDep,
    context: OrgAdmin,
    organisation_id: str,
    invitation_id: str,
) -> None:
    _require_path_match(context, organisation_id)
    await members.revoke_invitation(session, context, invitation_id)
    await session.commit()


@router.post(
    "/invitations/accept",
    response_model=MyMembershipPublic,
    summary="Accept an organisation invitation",
    description=(
        "Redeems the emailed token (sent in the body, never the path) for the "
        "signed-in person. 400 when the token is unknown, expired, used or "
        "revoked; 403 when it was sent to a different email address."
    ),
    responses={**AUTHENTICATED, **BAD_REQUEST},
)
async def accept_invitation(
    *, session: SessionDep, current_user: AccountUser, payload: InvitationAccept
) -> Any:
    membership, organisation = await members.accept_invitation(
        session, current_user, payload.token
    )
    result = MyMembershipPublic(
        membership_id=membership.id,
        role=MembershipRole(membership.role),
        status=MembershipStatus(membership.status),
        joined_at=membership.created_at,
        organisation=OrganisationSummary.model_validate(
            organisation, from_attributes=True
        ),
    )
    await session.commit()
    return result
