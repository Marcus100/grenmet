"""Membership management: roster, role changes, removal and emailed invitations.

Invitations follow the ADR-0018 challenge pattern: a random token is emailed,
only its SHA-256 is stored, and it expires, is single-use and can be revoked.
Functions flush but never commit; the router owns the transaction. The audit
actor is set here so history commits with the change.

Role rules: admins manage members and admins; only owners may grant or touch
the owner role. The last active owner can be neither demoted nor removed.
"""

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlencode

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.email_verification import require_verified_or_admin_activated
from src.auth.models import User
from src.config import settings
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.organisations import grants
from src.organisations.dependencies import TEAM_SESSION_APP, OrgContext
from src.organisations.exceptions import (
    AlreadyMemberError,
    InvitationAcceptedError,
    InvitationEmailMismatchError,
    InvitationInvalidError,
    InvitationNotFoundError,
    LastOwnerError,
    MembershipNotFoundError,
    OrganisationRoleError,
    OrganisationSuspendedError,
)
from src.organisations.models import (
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
    new_invitation_id,
    new_membership_id,
)
from src.pagination import PaginationParams
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

INVITATION_TTL = timedelta(days=7)
INVITATION_TEMPLATE = "organisation-invitation"
ACCEPT_PATH = "/organisations/accept"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# Roles that carry administrative power; the account needs a verified email (ADR-0018).
_POWER_ROLES = frozenset({MembershipRole.ADMIN.value, MembershipRole.OWNER.value})


def _is_owner(role: str) -> bool:
    return role == MembershipRole.OWNER.value


def _require_may_grant(context: OrgContext, role: str) -> None:
    """Only owners may grant, touch or revoke the owner role."""
    if _is_owner(role) and context.role != MembershipRole.OWNER:
        raise OrganisationRoleError()


def accept_link(token: str) -> str:
    base = (settings.FRONTEND_HOST or "").rstrip("/")
    return f"{base}{ACCEPT_PATH}?{urlencode({'token': token})}"


# ── Roster ───────────────────────────────────────────────────────────────────


async def list_members(
    session: AsyncSession, context: OrgContext, page: PaginationParams
) -> tuple[list[tuple[Membership, User]], int]:
    return await list_members_of(session, context.organisation_id, page)


async def list_members_of(
    session: AsyncSession, organisation_id: str, page: PaginationParams
) -> tuple[list[tuple[Membership, User]], int]:
    """Active roster of one organisation (also used by the superuser control plane)."""
    where = (
        Membership.organisation_id == organisation_id,
        Membership.status == MembershipStatus.ACTIVE.value,
    )
    total = await session.scalar(
        select(func.count()).select_from(Membership).where(*where)
    )
    rows = await session.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(*where)
        .order_by(User.first_name, User.last_name, Membership.id)
        .offset(page.skip)
        .limit(page.limit)
    )
    return [(m, u) for m, u in rows.all()], total or 0


async def _get_membership(
    session: AsyncSession, organisation_id: str, membership_id: str
) -> Membership:
    membership = await session.scalar(
        select(Membership)
        .where(
            Membership.id == membership_id,
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update()
    )
    if membership is None:
        raise MembershipNotFoundError()
    return membership


async def _ensure_not_last_owner(
    session: AsyncSession, organisation_id: str, membership: Membership
) -> None:
    """Lock the active owners and refuse to drop the final one."""
    if not _is_owner(membership.role):
        return
    owners = await session.scalars(
        select(Membership.id)
        .where(
            Membership.organisation_id == organisation_id,
            Membership.role == MembershipRole.OWNER.value,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update()
    )
    if len(owners.all()) <= 1:
        raise LastOwnerError()


async def apply_role_change(
    session: AsyncSession,
    organisation_id: str,
    membership_id: str,
    role: MembershipRole,
    *,
    actor_id: uuid.UUID,
    actor_may_grant_owner: bool,
) -> tuple[Membership, User]:
    """Shared by the organisation-scoped route and the audited control-plane route."""
    audit_service.set_actor(session, actor_id)
    membership = await _get_membership(session, organisation_id, membership_id)
    if not actor_may_grant_owner and (
        _is_owner(membership.role) or _is_owner(role.value)
    ):
        raise OrganisationRoleError()  # touching an owner, or granting owner
    user = await session.get(User, membership.user_id)
    assert user is not None
    if role.value in _POWER_ROLES and role.value != membership.role:
        await require_verified_or_admin_activated(
            session, user, "receive an administrator role"
        )
    if role.value != membership.role:
        if _is_owner(membership.role):
            await _ensure_not_last_owner(session, organisation_id, membership)
        membership.role = role.value
        await session.flush()
    return membership, user


async def change_role(
    session: AsyncSession,
    context: OrgContext,
    membership_id: str,
    role: MembershipRole,
) -> tuple[Membership, User]:
    return await apply_role_change(
        session,
        context.organisation_id,
        membership_id,
        role,
        actor_id=context.user.id,
        actor_may_grant_owner=context.role == MembershipRole.OWNER,
    )


async def apply_removal(
    session: AsyncSession,
    organisation_id: str,
    membership_id: str,
    *,
    actor_id: uuid.UUID,
    actor_may_grant_owner: bool,
) -> Membership:
    audit_service.set_actor(session, actor_id)
    membership = await _get_membership(session, organisation_id, membership_id)
    if not actor_may_grant_owner and _is_owner(membership.role):
        raise OrganisationRoleError()
    await _ensure_not_last_owner(session, organisation_id, membership)
    membership.status = MembershipStatus.REMOVED.value
    await session.flush()
    await grants.revoke_all_for_membership(
        session, membership_id=membership.id, actor_id=actor_id
    )
    # Access the removed person handed out ends with their own (ADR-0044, S3).
    # A demotion only lists it (``GET .../issued-grants``): admins decide.
    ended = await grants.revoke_issued_by(
        session,
        organisation_id=organisation_id,
        user_id=membership.user_id,
        actor_id=actor_id,
    )
    if ended:
        # Visible next to the per-grant history rows (the 204 response has no body).
        await audit_service.record_change(
            session,
            entity_type="platform_organisation",
            entity_id=organisation_id,
            record_type="organisation_membership",
            record_id=membership.id,
            action="revoke_issued_grants",
            changes={"grants_revoked": (None, ended)},
            organisation_id=organisation_id,
        )
    return membership


@dataclass(frozen=True)
class EventsAccessRevocation:
    """What an Events-session removal ended. The membership and other products stay."""

    membership_id: str
    grants_revoked: int
    issued_grants_revoked: int


async def revoke_events_access(
    session: AsyncSession, context: OrgContext, membership_id: str
) -> EventsAccessRevocation:
    """An Events app session's removal: end the person's Events access in this
    organisation only.

    Ends their live ``events-*`` grants here and the Events grants they issued here.
    The membership, other products, other organisations and the account-level Events
    opt-in (the Join role link) stay. The owner, lock and last-owner rules are the
    same as for a full removal."""
    organisation_id = context.organisation_id
    audit_service.set_actor(session, context.user.id)
    membership = await _get_membership(session, organisation_id, membership_id)
    if context.role != MembershipRole.OWNER and _is_owner(membership.role):
        raise OrganisationRoleError()
    await _ensure_not_last_owner(session, organisation_id, membership)
    products = (TEAM_SESSION_APP,)
    grants_revoked = await grants.revoke_product_grants(
        session,
        organisation_id=organisation_id,
        membership_id=membership.id,
        products=products,
        actor_id=context.user.id,
    )
    issued = await grants.revoke_issued_by(
        session,
        organisation_id=organisation_id,
        user_id=membership.user_id,
        actor_id=context.user.id,
        products=products,
    )
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation_id,
        record_type="organisation_membership",
        record_id=membership.id,
        action="revoke_events_access",
        changes={
            "grants_revoked": (None, grants_revoked),
            "issued_grants_revoked": (None, issued),
        },
        organisation_id=organisation_id,
    )
    logger.info(
        "organisation events access revoked",
        extra={
            "organisation_id": organisation_id,
            "membership_id": membership.id,
            "grants_revoked": grants_revoked,
        },
    )
    return EventsAccessRevocation(
        membership_id=membership.id,
        grants_revoked=grants_revoked,
        issued_grants_revoked=issued,
    )


async def remove_member(
    session: AsyncSession, context: OrgContext, membership_id: str
) -> EventsAccessRevocation | None:
    """Ends a membership, or for an Events app session only the Events access.

    Returns ``None`` when the membership was removed from the whole organisation (an
    account session), otherwise what the Events-only revocation ended (owner decision,
    2026-10-30)."""
    if context.session_app == TEAM_SESSION_APP:
        return await revoke_events_access(session, context, membership_id)
    await apply_removal(
        session,
        context.organisation_id,
        membership_id,
        actor_id=context.user.id,
        actor_may_grant_owner=context.role == MembershipRole.OWNER,
    )
    return None


# ── Invitations ──────────────────────────────────────────────────────────────


def _pending(organisation_id: str) -> list[ColumnElement[bool]]:
    return [
        Invitation.organisation_id == organisation_id,
        Invitation.accepted_at.is_(None),
        Invitation.revoked_at.is_(None),
        Invitation.expires_at > utc_now(),
    ]


async def list_pending_invitations(
    session: AsyncSession, context: OrgContext
) -> list[Invitation]:
    rows = await session.scalars(
        select(Invitation)
        .where(*_pending(context.organisation_id))
        .order_by(Invitation.created_at.desc(), Invitation.id)
    )
    return list(rows.all())


async def invite(
    session: AsyncSession, context: OrgContext, *, email: str, role: MembershipRole
) -> Invitation:
    _require_may_grant(context, role.value)
    clean = notification_service.normalise_email(email)
    audit_service.set_actor(session, context.user.id)

    existing = await session.scalar(
        select(Membership.id)
        .join(User, User.id == Membership.user_id)
        .where(
            Membership.organisation_id == context.organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            func.lower(User.email) == clean,
        )
    )
    if existing is not None:
        raise AlreadyMemberError()

    # A fresh invitation replaces any pending one for the same address.
    now = utc_now()
    stale = await session.scalars(
        select(Invitation).where(
            *_pending(context.organisation_id), Invitation.email == clean
        )
    )
    for old in stale.all():
        old.revoked_at = now
    await session.flush()

    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        id=new_invitation_id(),
        organisation_id=context.organisation_id,
        email=clean,
        role=role.value,
        token_hash=hash_token(token),
        expires_at=now + INVITATION_TTL,
        invited_by_user_id=context.user.id,
    )
    session.add(invitation)
    await session.flush()

    notification_service.enqueue_email(
        session=session,
        to_email=clean,
        subject=f"You are invited to join {context.organisation.name}",
        transactional=True,
        template=INVITATION_TEMPLATE,
        props={
            "projectName": email_settings.PROJECT_NAME,
            "organisationName": context.organisation.name,
            "inviterName": context.user.full_name or context.user.email,
            "roleLabel": role.value,
            "acceptLink": accept_link(token),
            "validDays": INVITATION_TTL.days,
        },
    )
    logger.info(
        "organisation invitation issued",
        extra={"organisation_id": context.organisation_id, "role": role.value},
    )
    return invitation


async def revoke_invitation(
    session: AsyncSession, context: OrgContext, invitation_id: str
) -> None:
    invitation = await session.scalar(
        select(Invitation)
        .where(
            Invitation.id == invitation_id,
            Invitation.organisation_id == context.organisation_id,
        )
        .with_for_update()
    )
    if invitation is None:
        raise InvitationNotFoundError()
    if invitation.accepted_at is not None:
        raise InvitationAcceptedError()
    _require_may_grant(context, invitation.role)
    if invitation.revoked_at is None:
        audit_service.set_actor(session, context.user.id)
        invitation.revoked_at = utc_now()
        await session.flush()


async def accept_invitation(
    session: AsyncSession, user: User, token: str
) -> tuple[Membership, PlatformOrganisation]:
    """Redeem a token for the signed-in user whose email it was sent to."""
    invitation = await session.scalar(
        select(Invitation)
        .where(Invitation.token_hash == hash_token(token.strip()))
        .with_for_update()
    )
    if (
        invitation is None
        or invitation.accepted_at is not None
        or invitation.revoked_at is not None
        or invitation.expires_at <= utc_now()
    ):
        raise InvitationInvalidError()
    if notification_service.normalise_email(user.email) != invitation.email:
        raise InvitationEmailMismatchError()
    if invitation.role in _POWER_ROLES:
        await require_verified_or_admin_activated(
            session, user, "accept an administrator role"
        )
    organisation = await session.get(PlatformOrganisation, invitation.organisation_id)
    if organisation is None:  # pragma: no cover - the foreign key guarantees it
        raise InvitationInvalidError()
    if organisation.status != OrganisationStatus.ACTIVE.value:
        raise OrganisationSuspendedError()

    audit_service.set_actor(session, user.id)
    membership = await session.scalar(
        select(Membership)
        .where(
            Membership.organisation_id == organisation.id,
            Membership.user_id == user.id,
        )
        .with_for_update()
    )
    if membership is None:
        membership = Membership(
            id=new_membership_id(),
            organisation_id=organisation.id,
            user_id=user.id,
            role=invitation.role,
            status=MembershipStatus.ACTIVE.value,
            invited_by_user_id=invitation.invited_by_user_id,
        )
        session.add(membership)
    elif membership.status != MembershipStatus.ACTIVE.value:
        membership.status = MembershipStatus.ACTIVE.value
        membership.role = invitation.role
        membership.invited_by_user_id = invitation.invited_by_user_id
    # An already-active member keeps their role; the invitation is just spent.
    invitation.accepted_at = utc_now()
    invitation.accepted_by_user_id = user.id
    await session.flush()
    return membership, organisation
