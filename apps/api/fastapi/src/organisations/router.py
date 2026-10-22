from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Response
from fastapi import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from src.auth.models import User
from src.dependencies import AccountUser, AdminUser, MfaAdminUser, SessionDep
from src.events.service import organiser_verification as events_verification
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgAdmin, OrgMember, OrgTeamManager
from src.pagination import PaginationDep
from src.rate_limit import limiter

from . import (
    admin_members,
    api_key_scopes,
    api_keys,
    entitlements,
    members,
    service,
    sites,
    team,
    verification,
)
from .api_key_auth import ApiKeyCaller
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
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyInfoPublic,
    ApiKeyListPublic,
    ApiKeyPublic,
    ApiKeyRotate,
    ApiKeyScopeCatalogue,
    AppEntitlementUpdate,
    AppOptionPublic,
    CurrentOrganisationPublic,
    InvitationAccept,
    InvitationCreate,
    InvitationPublic,
    MemberListPublic,
    MemberPublic,
    MemberRoleUpdate,
    MembershipGrantCreate,
    MembershipGrantPublic,
    MyMembershipPublic,
    OrganisationAdminDetail,
    OrganisationAdminListPublic,
    OrganisationAdminPublic,
    OrganisationAppPublic,
    OrganisationSummary,
    PlatformMemberAdd,
    PlatformMemberRemove,
    PlatformMemberRoleUpdate,
    PlatformOrganisationCreate,
    PlatformOrganisationUpdate,
    PublicSiteAdmin,
    PublicSiteCreate,
    PublicSiteListPublic,
    PublicSitePublic,
    PublicSiteUpdate,
    RoleBundlePublic,
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


# ── Public sites (ADR-0025 N1/N2) ────────────────────────────────────────────


@router.get(
    "/public/sites/{site_key}",
    response_model=PublicSitePublic,
    summary="Read a public site",
    description=(
        "What a public website needs to render its forms: its name, which forms "
        "it accepts and its Turnstile site key. 404 when the key is unknown or "
        "its organisation is suspended. Never returns a secret."
    ),
    responses={**NOT_FOUND},
)
async def get_public_site(
    *, session: SessionDep, site_key: Annotated[str, Path(max_length=40)]
) -> Any:
    site = await sites.require_public_site(session, site_key)
    return PublicSitePublic(
        key=site.key,
        name=site.name,
        accepts_contact=site.accepts_contact,
        accepts_subscriptions=site.accepts_subscriptions,
        turnstile_site_key=site.turnstile_site_key,
    )


@router.get(
    "/org/sites",
    response_model=PublicSiteListPublic,
    summary="List my organisation's public sites",
    description=(
        "The public sites of the organisation in X-Barrels-Organisation. Admins "
        "and owners only. Secrets are never returned."
    ),
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def list_org_sites(*, session: SessionDep, context: OrgAdmin) -> Any:
    rows = await sites.list_sites(session, organisation_id=context.organisation_id)
    return PublicSiteListPublic(data=[sites.to_admin(r) for r in rows], count=len(rows))


@router.get(
    "/admin/sites",
    response_model=PublicSiteListPublic,
    summary="List public sites",
    description=(
        "Control plane, superuser only: every public site, or one "
        "organisation's with `organisation_id`."
    ),
    responses={**AUTHENTICATED},
)
async def list_admin_sites(
    *,
    session: SessionDep,
    _admin: AdminUser,
    organisation_id: str | None = Query(default=None, max_length=100),
) -> Any:
    rows = await sites.list_sites(session, organisation_id=organisation_id)
    return PublicSiteListPublic(data=[sites.to_admin(r) for r in rows], count=len(rows))


@router.post(
    "/admin/sites",
    response_model=PublicSiteAdmin,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a public site",
    description=(
        "Control plane, superuser only. The key is permanent. A Turnstile "
        "secret is stored encrypted and never returned; 503 when secret "
        "storage is not configured. 409 when the key is taken."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND, **CONFLICT},
)
async def create_admin_site(
    *, session: SessionDep, admin: AdminUser, payload: PublicSiteCreate
) -> Any:
    site = await sites.create_site(session, admin, payload)
    await session.commit()
    await session.refresh(site)
    return sites.to_admin(site)


@router.patch(
    "/admin/sites/{site_id}",
    response_model=PublicSiteAdmin,
    summary="Update a public site",
    description=(
        "Control plane, superuser only. Only the fields sent change; `null` "
        "clears a nullable setting, including the Turnstile secret."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def update_admin_site(
    *, session: SessionDep, admin: AdminUser, site_id: str, payload: PublicSiteUpdate
) -> Any:
    site = await sites.update_site(session, admin, site_id, payload)
    await session.commit()
    await session.refresh(site)
    return sites.to_admin(site)


# ── API keys (PF5, ADR-0029) ─────────────────────────────────────────────────

KEY_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}


GRANT_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


@router.get(
    "/org/role-bundles",
    response_model=list[RoleBundlePublic],
    summary="List role bundles my organisation can grant",
    description=(
        "Bundles of the products the organisation is entitled to. `grantable` is "
        "true when the caller holds every permission in the bundle and the "
        "product's team-manage permission. Needs a team-manage permission "
        "(owners and admins hold it)."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def list_role_bundles(*, session: SessionDep, context: OrgTeamManager) -> Any:
    return await team.list_bundles(session, context)


@router.get(
    "/org/members/{membership_id}/grants",
    response_model=list[MembershipGrantPublic],
    summary="List a member's role grants",
    description="Live grants only (not revoked, not expired). Display names only.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def list_member_grants(
    *, session: SessionDep, context: OrgTeamManager, membership_id: str
) -> Any:
    return await team.list_member_grants(session, context, membership_id=membership_id)


@router.get(
    "/org/members/{membership_id}/issued-grants",
    response_model=list[MembershipGrantPublic],
    summary="List live grants a member issued",
    description=(
        "For reviewing a demoted member's handouts. Direct grants only: grants made "
        "by the people they granted to are not followed. Removing a member revokes "
        "them automatically; a demotion does not. Admins and owners only."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def list_issued_grants(
    *, session: SessionDep, context: OrgAdmin, membership_id: str
) -> Any:
    return await team.list_issued(session, context, membership_id=membership_id)


@router.post(
    "/org/members/{membership_id}/grants",
    response_model=MembershipGrantPublic,
    status_code=http_status.HTTP_201_CREATED,
    summary="Grant a role bundle to a member",
    description=(
        "You must hold every permission in the bundle and its product's "
        "team-manage permission, you cannot change your own roles (403), and the "
        "grant cannot outlast your own access (422). `expires_at` is UTC and must "
        "be in the future. 409 when the member already holds the role or another "
        "request changed it at the same time."
    ),
    responses={**GRANT_ERRORS},
)
async def grant_member_role(
    *,
    session: SessionDep,
    context: OrgTeamManager,
    membership_id: str,
    payload: MembershipGrantCreate,
) -> Any:
    return await team.run_and_commit(
        session,
        team.grant(
            session,
            context,
            membership_id=membership_id,
            role_key=payload.role_key,
            expires_at=payload.expires_at,
        ),
    )


@router.post(
    "/org/grants/{grant_id}/revoke",
    response_model=MembershipGrantPublic,
    summary="Revoke a role grant",
    description=(
        "Needs the bundle's permissions and its product's team-manage permission. "
        "Revoking an already revoked grant returns it unchanged."
    ),
    responses={**GRANT_ERRORS},
)
async def revoke_member_grant(
    *, session: SessionDep, context: OrgTeamManager, grant_id: str
) -> Any:
    return await team.run_and_commit(
        session, team.revoke(session, context, grant_id=grant_id)
    )


@router.get(
    "/org/api-key-scopes",
    response_model=ApiKeyScopeCatalogue,
    summary="List API key scopes",
    description="Every scope an API key can hold. Admins and owners only.",
    responses={**KEY_ERRORS},
)
async def list_api_key_scopes(*, _context: OrgAdmin) -> Any:
    return ApiKeyScopeCatalogue(scopes=api_key_scopes.all_scopes())


@router.post(
    "/org/api-keys",
    response_model=ApiKeyCreated,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create an API key",
    description=(
        "Admins and owners only. The response holds the only copy of the "
        "secret. 422 for an unknown scope; 403 when the organisation is not "
        "entitled to a scope's product. Lifetime defaults to 90 days, at most "
        "one year."
    ),
    responses={**KEY_ERRORS},
)
async def create_api_key(
    *, session: SessionDep, context: OrgAdmin, payload: ApiKeyCreate
) -> Any:
    key, secret = await api_keys.create_key(
        session, context.user, organisation_id=context.organisation_id, payload=payload
    )
    await session.commit()
    return ApiKeyCreated(
        **ApiKeyPublic.model_validate(key, from_attributes=True).model_dump(),
        secret=secret,
    )


@router.get(
    "/org/api-keys",
    response_model=ApiKeyListPublic,
    summary="List my organisation's API keys",
    description=(
        "Admins and owners only, newest first. Shows the public prefix, never "
        "the secret."
    ),
    responses={**KEY_ERRORS},
)
async def list_org_api_keys(
    *, session: SessionDep, context: OrgAdmin, pagination: PaginationDep
) -> Any:
    rows, total = await api_keys.list_keys(
        session,
        organisation_id=context.organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return ApiKeyListPublic(
        data=[ApiKeyPublic.model_validate(r, from_attributes=True) for r in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/org/api-keys/{key_id}/rotate",
    response_model=ApiKeyCreated,
    status_code=http_status.HTTP_201_CREATED,
    summary="Rotate an API key",
    description=(
        "Issues a successor with the same name and scopes and returns its "
        "secret once. The old key stops working after `overlap_hours` (default "
        "24; 0 revokes it now). 409 when the key is already revoked or expired."
    ),
    responses={**KEY_ERRORS, **CONFLICT},
)
async def rotate_api_key(
    *,
    session: SessionDep,
    context: OrgAdmin,
    key_id: Annotated[str, Path(max_length=100)],
    payload: ApiKeyRotate,
) -> Any:
    key, secret = await api_keys.rotate_key(
        session,
        context.user,
        organisation_id=context.organisation_id,
        key_id=key_id,
        payload=payload,
    )
    await session.commit()
    return ApiKeyCreated(
        **ApiKeyPublic.model_validate(key, from_attributes=True).model_dump(),
        secret=secret,
    )


@router.post(
    "/org/api-keys/{key_id}/revoke",
    response_model=ApiKeyPublic,
    summary="Revoke an API key",
    description="Admins and owners only. Takes effect immediately; idempotent.",
    responses={**KEY_ERRORS},
)
async def revoke_org_api_key(
    *,
    session: SessionDep,
    context: OrgAdmin,
    key_id: Annotated[str, Path(max_length=100)],
) -> Any:
    key = await api_keys.revoke_key(
        session,
        context.user,
        key_id=key_id,
        organisation_id=context.organisation_id,
    )
    await session.commit()
    return key


@router.get(
    "/admin/api-keys",
    response_model=ApiKeyListPublic,
    summary="List API keys across organisations",
    description=(
        "Control plane, superuser only. Filter with `organisation_id`. Never "
        "returns secrets."
    ),
    responses={**AUTHENTICATED},
)
async def list_admin_api_keys(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    organisation_id: str | None = Query(default=None, max_length=100),
) -> Any:
    rows, total = await api_keys.list_keys(
        session,
        organisation_id=organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return ApiKeyListPublic(
        data=[ApiKeyPublic.model_validate(r, from_attributes=True) for r in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/admin/api-keys/{key_id}/revoke",
    response_model=ApiKeyPublic,
    summary="Revoke any organisation's API key",
    description="Control plane, superuser only. Takes effect immediately; idempotent.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def revoke_admin_api_key(
    *,
    session: SessionDep,
    admin: AdminUser,
    key_id: Annotated[str, Path(max_length=100)],
) -> Any:
    key = await api_keys.revoke_key(session, admin, key_id=key_id, organisation_id=None)
    await session.commit()
    return key


@router.get(
    "/org/key-info",
    response_model=ApiKeyInfoPublic,
    summary="Describe the calling API key",
    description=(
        "Authenticated with `Authorization: Bearer bk_...` (an organisation API "
        "key, not a user session). Any valid key may call it. 401 for an "
        "unknown, expired or revoked key; 403 for a suspended organisation."
    ),
    responses={**AUTHENTICATED},
)
async def key_info(*, caller: ApiKeyCaller) -> Any:
    return ApiKeyInfoPublic(
        organisation_id=caller.organisation_id,
        key_id=caller.key.id,
        name=caller.key.name,
        key_prefix=caller.key.key_prefix,
        scopes=sorted(caller.scopes),
        expires_at=caller.key.expires_at,
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
            AppOptionPublic(key=option.key, label=option.label)
            for option in entitlements.options()
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
        "organisation's history. Events shows its organiser as verified and "
        "notifies its owners. MFA superuser. 409 when already verified or suspended."
    ),
    responses=WRITE_ERRORS,
)
async def verify_one(
    *,
    session: SessionDep,
    admin: MfaAdminUser,
    organisation_id: str,
    payload: VerificationDecision,
) -> Any:
    # One approval path: the same write and side effects as the Events queue.
    await events_verification.apply_decision(
        session,
        admin,
        organisation_id,
        verified=True,
        reason=payload.reason,
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
    admin: MfaAdminUser,
    organisation_id: str,
    payload: VerificationDecision,
) -> Any:
    # One approval path: the same write and side effects as the Events queue.
    await events_verification.apply_decision(
        session,
        admin,
        organisation_id,
        verified=False,
        reason=payload.reason,
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


MFA_ERRORS = {
    **AUTHENTICATED,
    **NOT_FOUND,
    **CONFLICT,
    403: {
        "description": "Superuser with an enrolled authenticator required "
        "(superuser_mfa_required), or the target lacks a verified or "
        "administrator-activated email for an owner/admin role"
    },
}


@router.post(
    "/{organisation_id}/admin/members",
    response_model=MemberPublic,
    status_code=201,
    summary="Add a member to any organisation (audited)",
    description=(
        "Superuser with an enrolled authenticator adds an account (by user id or "
        "email) as member, admin or owner. This is how a superuser enters a "
        "business's data: there is no organisation bypass, so adding yourself "
        "works the same way. A reason is required and recorded with the actor "
        "and target. Owner and admin roles need a verified or "
        "administrator-activated target. 409 when already a member."
    ),
    responses=MFA_ERRORS,
)
@limiter.limit("30/minute")
async def add_member_admin(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    admin: MfaAdminUser,
    organisation_id: str,
    payload: PlatformMemberAdd,
) -> Any:
    _ = request, response
    membership, user = await admin_members.add(
        session,
        admin,
        organisation_id,
        user_id=payload.user_id,
        email=payload.email,
        role=payload.role,
        reason=payload.reason,
    )
    result = _member(membership, user)
    await session.commit()
    return result


@router.patch(
    "/{organisation_id}/admin/members/{membership_id}",
    response_model=MemberPublic,
    summary="Change any member's role (audited)",
    description=(
        "Superuser with an enrolled authenticator changes a member's role. "
        "A reason is required. 409 when it would leave the organisation "
        "without an owner."
    ),
    responses=MFA_ERRORS,
)
@limiter.limit("30/minute")
async def update_member_admin(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    admin: MfaAdminUser,
    organisation_id: str,
    membership_id: str,
    payload: PlatformMemberRoleUpdate,
) -> Any:
    _ = request, response
    membership, user = await admin_members.change(
        session,
        admin,
        organisation_id,
        membership_id,
        payload.role,
        reason=payload.reason,
    )
    result = _member(membership, user)
    await session.commit()
    return result


@router.delete(
    "/{organisation_id}/admin/members/{membership_id}",
    status_code=204,
    summary="Remove any member (audited)",
    description=(
        "Superuser with an enrolled authenticator ends a membership. A reason "
        "is required in the body. 409 when it would leave the organisation "
        "without an owner."
    ),
    responses=MFA_ERRORS,
)
@limiter.limit("30/minute")
async def delete_member_admin(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    admin: MfaAdminUser,
    organisation_id: str,
    membership_id: str,
    payload: PlatformMemberRemove,
) -> None:
    _ = request, response
    await team.run_and_commit(
        session,
        admin_members.remove(
            session, admin, organisation_id, membership_id, reason=payload.reason
        ),
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
    await team.run_and_commit(
        session, members.remove_member(session, context, membership_id)
    )


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
