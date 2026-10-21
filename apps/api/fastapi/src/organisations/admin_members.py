"""Superuser membership management (owner decision 2026-10-21, ADR-0022 stands).

A superuser reaches a business's data by becoming a *member* through an explicit,
audited route; there is no silent organisation bypass (``resolve_org_context``,
``require_org_app`` and ``org_or_key`` are untouched). The caller must be an active
superuser with an enrolled authenticator (``superuser_mfa``), a reason is required,
and every use writes a ``platform_organisation_member`` audit entry with actor,
target user, role and reason next to the membership field diff.

Role rules are the existing ones: ``add_member`` / ``apply_role_change`` demand a
verified or administrator-activated target for owner and admin roles
(``skip_email_check`` stays False) and the last active owner is protected. A
superuser acts as an owner here, so they may grant, change and remove owners.
Functions flush; the router commits.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth import superuser_mfa
from src.auth.email_verification import require_verified_or_admin_activated
from src.auth.models import User
from src.exceptions import AppException
from src.notifications import service as notification_service
from src.organisations import members, service
from src.organisations.exceptions import AlreadyMemberError, OrganisationNotFoundError
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    PlatformOrganisation,
)

RECORD_TYPE = "platform_organisation_member"
_POWER_ROLES = frozenset({MembershipRole.ADMIN, MembershipRole.OWNER})


async def _organisation(session: AsyncSession, organisation_id: str) -> None:
    if await session.get(PlatformOrganisation, organisation_id) is None:
        raise OrganisationNotFoundError()


async def _target(
    session: AsyncSession, *, user_id: uuid.UUID | None, email: str | None
) -> User:
    if user_id is not None:
        user = await session.get(User, user_id)
    elif email:
        clean = notification_service.normalise_email(email)
        user = await session.scalar(select(User).where(func.lower(User.email) == clean))
    else:
        raise AppException("Give a user id or an email address", 422)
    if user is None:
        raise AppException("Account not found", 404)
    if not user.is_active:
        raise AppException("Inactive accounts cannot be added", 409)
    return user


async def _record(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    membership: Membership,
    *,
    action: str,
    reason: str,
    old_role: str | None,
    new_role: str | None,
) -> None:
    audit_service.set_actor(session, actor.id)
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation_id,
        record_type=RECORD_TYPE,
        record_id=membership.id,
        action=action,
        changes={
            "reason": (None, reason),
            "target_user_id": (None, str(membership.user_id)),
            "role": (old_role, new_role),
            "self_service": (None, membership.user_id == actor.id),
        },
        organisation_id=organisation_id,
    )


async def add(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    *,
    user_id: uuid.UUID | None,
    email: str | None,
    role: MembershipRole,
    reason: str,
) -> tuple[Membership, User]:
    superuser_mfa.require_superuser_mfa(actor)
    await _organisation(session, organisation_id)
    user = await _target(session, user_id=user_id, email=email)
    audit_service.set_actor(session, actor.id)
    existing = await session.scalar(
        select(Membership)
        .where(
            Membership.organisation_id == organisation_id,
            Membership.user_id == user.id,
        )
        .with_for_update()
    )
    if existing is not None and existing.status == MembershipStatus.ACTIVE.value:
        raise AlreadyMemberError()
    if existing is None:
        membership = await service.add_member(
            session,
            organisation_id=organisation_id,
            user_id=user.id,
            role=role,
            invited_by_user_id=actor.id,
            skip_email_check=False,
        )
    else:  # a removed or invited row is reactivated (one row per organisation and user)
        if role in _POWER_ROLES:
            await require_verified_or_admin_activated(
                session, user, f"become an organisation {role.value}"
            )
        existing.status = MembershipStatus.ACTIVE.value
        existing.role = role.value
        existing.invited_by_user_id = actor.id
        membership = existing
        await session.flush()
    await _record(
        session,
        actor,
        organisation_id,
        membership,
        action="add",
        reason=reason,
        old_role=None,
        new_role=role.value,
    )
    await session.flush()
    return membership, user


async def change(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    membership_id: str,
    role: MembershipRole,
    *,
    reason: str,
) -> tuple[Membership, User]:
    superuser_mfa.require_superuser_mfa(actor)
    await _organisation(session, organisation_id)
    before = await session.scalar(
        select(Membership.role).where(
            Membership.id == membership_id,
            Membership.organisation_id == organisation_id,
        )
    )
    membership, user = await members.apply_role_change(
        session,
        organisation_id,
        membership_id,
        role,
        actor_id=actor.id,
        actor_may_grant_owner=True,
    )
    await _record(
        session,
        actor,
        organisation_id,
        membership,
        action="change_role",
        reason=reason,
        old_role=before,
        new_role=role.value,
    )
    await session.flush()
    return membership, user


async def remove(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    membership_id: str,
    *,
    reason: str,
) -> None:
    superuser_mfa.require_superuser_mfa(actor)
    await _organisation(session, organisation_id)
    membership = await members.apply_removal(
        session,
        organisation_id,
        membership_id,
        actor_id=actor.id,
        actor_may_grant_owner=True,
    )
    await _record(
        session,
        actor,
        organisation_id,
        membership,
        action="remove",
        reason=reason,
        old_role=membership.role,
        new_role=None,
    )
    await session.flush()
