"""Printix onboarding by a Barrels administrator (ADR-0060 organiser amendment).

A superuser with an authenticator sets one person's Printix access inside one
organisation: none, gate lead (``printix-gate-lead``) or organiser
(``printix-organiser``). The same change gives or takes away the global
``printix-member`` role (``app.printix.access``), without which a non-superuser
cannot sign in to the Printix app.

* The bundle grant has no granter (``granted_by`` NULL): the grantor-must-be-an-
  active-member rule (``grants._granter_is_active``) would otherwise void a grant made
  by a superuser who is not a member, and a NULL granter is untouched by the grant
  cascade. The audit actor is still the administrator.
* Owners and admins already hold every Printix key through their role, so they take
  no bundle; changing their access only gives or keeps the sign-in role.
* ``printix-member`` is taken away only when the person holds no other Printix access
  (a live bundle in any organisation, or owner or admin of a Printix organisation),
  and their Printix sessions end with it.

Functions flush; the router commits.
"""

import uuid
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth import eligibility as auth_eligibility
from src.auth import service as auth_service
from src.auth.models import Role, User, UserRoleLink
from src.auth.superuser_mfa import require_superuser_mfa
from src.exceptions import AppException
from src.organisations import admin_members, grants
from src.organisations.exceptions import MembershipNotFoundError
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
    new_grant_id,
)
from src.utils.datetime import utc_now

from . import app_role
from .exceptions import PrintixConflict, PrintixNotFound

APP_KEY = app_role.APP_KEY
APP_ROLE = app_role.APP_ROLE
RECORD_TYPE = "platform_organisation_member"
POWER_ROLES = app_role.POWER_ROLES


class PrintixAccess(StrEnum):
    NONE = "none"
    GATE_LEAD = "gate_lead"
    ORGANISER = "organiser"


BUNDLE_OF: dict[PrintixAccess, str] = {
    PrintixAccess.GATE_LEAD: "printix-gate-lead",
    PrintixAccess.ORGANISER: "printix-organiser",
}
_BUNDLES = frozenset(BUNDLE_OF.values())


def access_of(role_keys: set[str]) -> PrintixAccess:
    """The strongest Printix bundle among ``role_keys``."""
    if BUNDLE_OF[PrintixAccess.ORGANISER] in role_keys:
        return PrintixAccess.ORGANISER
    if BUNDLE_OF[PrintixAccess.GATE_LEAD] in role_keys:
        return PrintixAccess.GATE_LEAD
    return PrintixAccess.NONE


async def organisation_entitled(session: AsyncSession, organisation_id: str) -> bool:
    if await session.get(PlatformOrganisation, organisation_id) is None:
        raise PrintixNotFound("Organisation not found")
    return APP_KEY in await grants.entitled_products(session, organisation_id)


async def _require_active(session: AsyncSession, organisation_id: str) -> None:
    """Giving access to a suspended organisation is refused (409)."""
    organisation = await session.get(PlatformOrganisation, organisation_id)
    if (
        organisation is not None
        and organisation.status != OrganisationStatus.ACTIVE.value
    ):
        raise PrintixConflict("This organisation is suspended. Reactivate it first.")


async def live_bundles(
    session: AsyncSession, membership_ids: list[str]
) -> dict[str, set[str]]:
    """Live Printix bundle keys per membership (revoked and lapsed grants excluded)."""
    if not membership_ids:
        return {}
    now = utc_now()
    rows = await session.execute(
        select(MembershipGrant.membership_id, MembershipGrant.role_key).where(
            MembershipGrant.membership_id.in_(membership_ids),
            MembershipGrant.role_key.in_(_BUNDLES),
            MembershipGrant.revoked_at.is_(None),
            (MembershipGrant.expires_at.is_(None)) | (MembershipGrant.expires_at > now),
        )
    )
    found: dict[str, set[str]] = {}
    for membership_id, role_key in rows.all():
        found.setdefault(membership_id, set()).add(role_key)
    return found


async def set_access(
    session: AsyncSession,
    admin: User,
    organisation_id: str,
    membership_id: str,
    access: PrintixAccess,
    *,
    reason: str,
) -> tuple[Membership, User, PrintixAccess, bool]:
    """Set the person's Printix access in the organisation. Returns the membership,
    the user, the access now held through a bundle and whether sign-in was changed."""
    require_superuser_mfa(admin)
    entitled = await organisation_entitled(session, organisation_id)
    if access is not PrintixAccess.NONE and not entitled:
        raise PrintixConflict(
            "Turn on Printix for this organisation first (App access on its page)."
        )
    if access is not PrintixAccess.NONE:
        await _require_active(session, organisation_id)
    audit_service.set_actor(session, admin.id)
    await grants.lock_roster(session, organisation_id)
    membership = await session.scalar(
        select(Membership)
        .where(
            Membership.id == membership_id,
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if membership is None:
        raise MembershipNotFoundError()
    user = await session.get(User, membership.user_id)
    if user is None or not user.is_active:
        raise AppException("Inactive accounts cannot be given access", 409)

    held_before = await app_role.holds_access(session, user.id)
    old_access = access_of(
        (await live_bundles(session, [membership.id])).get(membership.id, set())
    )
    power = membership.role in POWER_ROLES
    if power and access is PrintixAccess.NONE:
        raise PrintixConflict(
            "Owners and admins hold every Printix permission through their role. "
            "Change their role to take it away."
        )
    if power:
        new_access = PrintixAccess.NONE  # no bundle: the role already gives it all
    else:
        new_access = access
        await _swap_bundle(session, membership, old_access, access)

    role_changed = await _sync_app_role(session, user, access, held_before=held_before)
    await _record(
        session,
        organisation_id,
        membership,
        reason=reason,
        old=old_access.value,
        new=new_access.value,
        role_changed=role_changed,
    )
    await session.flush()
    return membership, user, new_access, role_changed


async def _swap_bundle(
    session: AsyncSession,
    membership: Membership,
    old: PrintixAccess,
    access: PrintixAccess,
) -> None:
    if old is access:
        return
    now = utc_now()
    held = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.membership_id == membership.id,
            MembershipGrant.role_key.in_(_BUNDLES),
            MembershipGrant.revoked_at.is_(None),
        )
        .with_for_update()
    )
    for grant in held.all():
        # A lapsed grant still holds the unique slot; close it at its real end.
        lapsed = grant.expires_at is not None and grant.expires_at <= now
        grant.revoked_at = grant.expires_at if lapsed else now
    await session.flush()
    if access is PrintixAccess.NONE:
        return
    session.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=membership.organisation_id,
            role_key=BUNDLE_OF[access],
            granted_by=None,
            granted_at=now,
            expires_at=None,
        )
    )
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError:  # a concurrent change took the slot
        raise PrintixConflict("Access changed at the same moment. Try again.") from None


async def _sync_app_role(
    session: AsyncSession,
    user: User,
    access: PrintixAccess,
    *,
    held_before: bool,
) -> bool:
    """Give ``printix-member`` for any access. Take it back only when this action
    ended the person's Printix access and none is left (``app_role``), so a role given
    by hand to someone with no Printix access is left alone."""
    if access is PrintixAccess.NONE:
        return held_before and await app_role.drop_role_if_unneeded(session, user.id)
    # Serialise role changes for one person (the link has a composite primary key).
    await session.execute(select(User.id).where(User.id == user.id).with_for_update())
    if await app_role.app_role_link(session, user.id) is not None:
        return False
    role_id = await session.scalar(select(Role.id).where(Role.name == APP_ROLE))
    session.add(UserRoleLink(user_id=user.id, role_id=role_id))
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError:
        raise PrintixConflict("Access changed at the same moment. Try again.") from None
    return True


async def _record(
    session: AsyncSession,
    organisation_id: str,
    membership: Membership,
    *,
    reason: str,
    old: str,
    new: str,
    role_changed: bool,
) -> None:
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation_id,
        record_type=RECORD_TYPE,
        record_id=membership.id,
        action="printix_access",
        changes={
            "reason": (None, reason),
            "target_user_id": (None, str(membership.user_id)),
            "printix_access": (old, new),
            "printix_sign_in_changed": (None, role_changed),
        },
        organisation_id=organisation_id,
    )


async def add_member(
    session: AsyncSession,
    admin: User,
    organisation_id: str,
    *,
    user_id: uuid.UUID | None,
    email: str | None,
    access: PrintixAccess,
    reason: str,
) -> tuple[Membership, User, PrintixAccess, bool]:
    """Add an existing account as a plain member, then set its Printix access.

    One transaction: if the access cannot be set (organisation not entitled), the
    membership is not added either. An email with no account is refused (404)."""
    require_superuser_mfa(admin)
    if access is PrintixAccess.NONE:
        raise AppException("Choose gate lead or organiser", 422)
    if not await organisation_entitled(session, organisation_id):
        raise PrintixConflict(
            "Turn on Printix for this organisation first (App access on its page)."
        )
    await _require_active(session, organisation_id)
    # ``admin_members.add`` takes the account lock, then the roster lock (#1523).
    membership, _user = await admin_members.add(
        session,
        admin,
        organisation_id,
        user_id=user_id,
        email=email,
        role=MembershipRole.MEMBER,
        reason=reason,
    )
    return await set_access(
        session, admin, organisation_id, membership.id, access, reason=reason
    )


async def sign_in_ready(session: AsyncSession, user: User) -> bool:
    """Whether the account can sign in to Printix now (superusers always can)."""
    return await auth_service.is_eligible_for_app(
        session=session, user=user, app_key=APP_KEY
    )


async def sign_in_ready_ids(session: AsyncSession, users: list[User]) -> set[uuid.UUID]:
    """The accounts among ``users`` that can sign in to Printix now, with a fixed number
    of queries however many rows a page holds."""
    return await auth_eligibility.eligible_user_ids_for_app(
        session=session, users=users, app_key=APP_KEY
    )
