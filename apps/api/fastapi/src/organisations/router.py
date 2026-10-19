from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import apps as auth_apps
from src.auth.models import User
from src.dependencies import AccountUser, AdminUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgAdmin, OrgMember
from src.pagination import PaginationDep

from . import members, service, verification
from .exceptions import OrganisationNotFoundError
from .models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationKind,
    OrganisationStatus,
    PlatformOrganisation,
)
from .schemas import (
    AppEntitlementUpdate,
    AppOptionPublic,
    CurrentOrganisationPublic,
    InvitationAccept,
    InvitationCreate,
    InvitationPublic,
    MemberListPublic,
    MemberPublic,
    MemberRoleUpdate,
    MyMembershipPublic,
    OrganisationAdminDetail,
    OrganisationAdminListPublic,
    OrganisationAdminPublic,
    OrganisationAppPublic,
    OrganisationSummary,
    PlatformOrganisationCreate,
    PlatformOrganisationUpdate,
    VerificationDecision,
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


# ── Control plane (C1, superuser only) ───────────────────────────────────────


def _admin_row(
    organisation: PlatformOrganisation, member_count: int
) -> OrganisationAdminPublic:
    return OrganisationAdminPublic(
        **OrganisationSummary.model_validate(
            organisation, from_attributes=True
        ).model_dump(),
        active_member_count=member_count,
        created_at=organisation.created_at,
        updated_at=organisation.updated_at,
    )


@router.get(
    "",
    response_model=OrganisationAdminListPublic,
    summary="List every organisation",
    description=(
        "Control-plane list for superusers: all organisations ordered by name, "
        "with active member counts. Filter by `q` (name or slug), `status` and "
        "`kind`."
    ),
    responses={**AUTHENTICATED},
)
async def list_all(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    q: str | None = Query(default=None, max_length=100),
    status: OrganisationStatus | None = None,
    kind: OrganisationKind | None = None,
) -> Any:
    rows, total = await service.admin_list_organisations(
        session,
        skip=pagination.skip,
        limit=pagination.limit,
        query=q,
        status=status,
        kind=kind,
    )
    return OrganisationAdminListPublic(
        data=[_admin_row(org, count) for org, count in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/{organisation_id}",
    response_model=OrganisationAdminDetail,
    summary="Read any organisation",
    description=(
        "Control-plane detail for superusers: the organisation, its active "
        "member count and app entitlements."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_one(
    *, session: SessionDep, _admin: AdminUser, organisation_id: str
) -> Any:
    return await _admin_detail(session, organisation_id)


async def _admin_detail(
    session: AsyncSession, organisation_id: str
) -> OrganisationAdminDetail:
    organisation, count, apps = await service.admin_get_organisation(
        session, organisation_id
    )
    return OrganisationAdminDetail(
        **_admin_row(organisation, count).model_dump(),
        apps=[
            OrganisationAppPublic(app_key=a.app_key, enabled=a.enabled) for a in apps
        ],
        available_apps=[
            AppOptionPublic(key=app.key, label=app.label)
            for app in auth_apps.all_apps()
        ],
    )


# ── Control plane writes (C2, superuser only; audited as platform_organisation) ──

WRITE_ERRORS = {**AUTHENTICATED, **NOT_FOUND, **CONFLICT}


@router.post(
    "",
    response_model=OrganisationAdminDetail,
    status_code=201,
    summary="Create an organisation",
    description=(
        "Superuser only. Creates an organisation of kind barrels, client or "
        "business with an immutable org_<hex> id. The slug is derived from the "
        "name unless given; 409 when a given slug is taken."
    ),
    responses={**AUTHENTICATED, **CONFLICT},
)
async def create_one(
    *, session: SessionDep, admin: AdminUser, payload: PlatformOrganisationCreate
) -> Any:
    organisation = await service.admin_create_organisation(
        session, admin, name=payload.name, kind=payload.kind, slug=payload.slug
    )
    organisation_id = organisation.id
    await session.commit()
    return await _admin_detail(session, organisation_id)


@router.patch(
    "/{organisation_id}",
    response_model=OrganisationAdminDetail,
    summary="Edit an organisation",
    description=(
        "Superuser only. Changes name, slug, kind or status (active or "
        "suspended). A suspended organisation is refused by every "
        "organisation-scoped route. 409 when the slug is taken."
    ),
    responses=WRITE_ERRORS,
)
async def update_one(
    *,
    session: SessionDep,
    admin: AdminUser,
    organisation_id: str,
    payload: PlatformOrganisationUpdate,
) -> Any:
    await service.admin_update_organisation(
        session,
        admin,
        organisation_id,
        name=payload.name,
        slug=payload.slug,
        status=payload.status,
        kind=payload.kind,
    )
    await session.commit()
    return await _admin_detail(session, organisation_id)


@router.post(
    "/{organisation_id}/verify",
    response_model=OrganisationAdminDetail,
    summary="Verify an organisation",
    description=(
        "Superuser only. Sets verified_at and records the reason in the "
        "organisation's history. Events shows its organiser as verified. 409 "
        "when already verified."
    ),
    responses=WRITE_ERRORS,
)
async def verify_one(
    *,
    session: SessionDep,
    admin: AdminUser,
    organisation_id: str,
    payload: VerificationDecision,
) -> Any:
    await service.admin_set_verified(
        session, admin, organisation_id, verified=True, reason=payload.reason
    )
    await session.commit()
    verification.clear_cache(organisation_id)
    return await _admin_detail(session, organisation_id)


@router.post(
    "/{organisation_id}/unverify",
    response_model=OrganisationAdminDetail,
    summary="Remove an organisation's verification",
    description=(
        "Superuser only. Clears verified_at and records the reason. 409 when "
        "the organisation is not verified."
    ),
    responses=WRITE_ERRORS,
)
async def unverify_one(
    *,
    session: SessionDep,
    admin: AdminUser,
    organisation_id: str,
    payload: VerificationDecision,
) -> Any:
    await service.admin_set_verified(
        session, admin, organisation_id, verified=False, reason=payload.reason
    )
    await session.commit()
    verification.clear_cache(organisation_id)
    return await _admin_detail(session, organisation_id)


@router.put(
    "/{organisation_id}/apps/{app_key}",
    response_model=OrganisationAdminDetail,
    summary="Enable or disable an app for an organisation",
    description=(
        "Superuser only. Sets the organisation's entitlement to a registered "
        "app. 422 when the app key is not in the app registry."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def set_app(
    *,
    session: SessionDep,
    admin: AdminUser,
    organisation_id: str,
    app_key: str,
    payload: AppEntitlementUpdate,
) -> Any:
    await service.admin_set_app(
        session, admin, organisation_id, app_key, enabled=payload.enabled
    )
    await session.commit()
    return await _admin_detail(session, organisation_id)


@router.get(
    "/{organisation_id}/admin/members",
    response_model=MemberListPublic,
    summary="List any organisation's members",
    description=(
        "Superuser only. Active members of any organisation, without needing a "
        "membership. The organisation-scoped roster stays admin and owner only."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def list_members_admin(
    *,
    session: SessionDep,
    _admin: AdminUser,
    organisation_id: str,
    pagination: PaginationDep,
) -> Any:
    await service.admin_get_organisation(session, organisation_id)
    rows, total = await members.list_members_of(session, organisation_id, pagination)
    return MemberListPublic(
        data=[_member(m, u) for m, u in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
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
