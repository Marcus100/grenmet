"""The ``printix-member`` sign-in role: one rule, shared by every route that can end
a person's Printix access (ADR-0060 organiser amendment, #1564).

A person holds Printix access when they are an active member of an organisation that
has Printix switched on and either own or administer it, or hold a live Printix
bundle (``printix-gate-lead``, ``printix-organiser``). The role is removed, and the
person's Printix sessions end with it, only when a change ended that access and none
is left anywhere. A role given by hand to someone who never held access is not
touched by an unrelated change.

This module is a leaf: it imports only models, so ``organisations`` (member removal,
demotion, grant revoke, entitlement switch) and ``printix.onboarding`` can both call
it without an import cycle. Callers that change access in one organisation take
``holders_of`` before the change and call ``release_lost`` after it, inside the same
transaction and after the roster lock. Functions flush; the caller commits."""

import logging
import uuid
from collections.abc import Collection

from sqlalchemy import ColumnElement, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import eligibility
from src.auth.models import Role, User, UserRoleLink
from src.auth.models import Session as LoginSession
from src.exceptions import AppException
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    OrganisationApp,
)
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

APP_KEY = "printix"
APP_ROLE = "printix-member"
BUNDLE_KEYS = frozenset({"printix-gate-lead", "printix-organiser"})
POWER_ROLES = (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)


def _holds_access_clause() -> ColumnElement[bool]:
    """Active membership in a Printix-entitled organisation, as owner, admin or with a
    live bundle."""
    now = utc_now()
    live_bundle = exists(
        select(MembershipGrant.id).where(
            MembershipGrant.membership_id == Membership.id,
            MembershipGrant.role_key.in_(BUNDLE_KEYS),
            MembershipGrant.revoked_at.is_(None),
            (MembershipGrant.expires_at.is_(None)) | (MembershipGrant.expires_at > now),
        )
    )
    entitled = exists(
        select(OrganisationApp.organisation_id).where(
            OrganisationApp.organisation_id == Membership.organisation_id,
            OrganisationApp.app_key == APP_KEY,
            OrganisationApp.enabled.is_(True),
        )
    )
    return (
        (Membership.status == MembershipStatus.ACTIVE.value)
        & entitled
        & (Membership.role.in_(POWER_ROLES) | live_bundle)
    )


async def holds_access(session: AsyncSession, user_id: uuid.UUID) -> bool:
    """Whether the person holds Printix access in any organisation right now."""
    found = await session.scalar(
        select(Membership.id)
        .where(Membership.user_id == user_id, _holds_access_clause())
        .limit(1)
    )
    return found is not None


async def holders_of(session: AsyncSession, organisation_id: str) -> set[uuid.UUID]:
    """People holding Printix access through this organisation right now. Take it
    before a change, then pass it to ``release_lost``."""
    rows = await session.scalars(
        select(Membership.user_id).where(
            Membership.organisation_id == organisation_id, _holds_access_clause()
        )
    )
    return set(rows.all())


async def release_lost(
    session: AsyncSession, organisation_id: str, holders_before: Collection[uuid.UUID]
) -> int:
    """After a change in ``organisation_id``: take ``printix-member`` from everyone who
    held access there before (``holders_of``) and does not now, and holds none
    elsewhere. Unrelated holders are neither locked nor queried. Returns how many
    people lost the role."""
    lost = set(holders_before) - await holders_of(session, organisation_id)
    return await release_users(session, lost)


async def release_users(session: AsyncSession, user_ids: Collection[uuid.UUID]) -> int:
    """``drop_role_if_unneeded`` for each person in id order (one role-id lookup)."""
    if not user_ids:
        return 0
    role_id = await _role_id(session)
    removed = 0
    for user_id in sorted(user_ids):
        if await drop_role_if_unneeded(session, user_id, role_id=role_id):
            removed += 1
    return removed


async def _role_id(session: AsyncSession) -> uuid.UUID:
    role_id = await session.scalar(select(Role.id).where(Role.name == APP_ROLE))
    if role_id is None:
        raise AppException("App roles are not seeded yet", 503)
    return role_id


async def app_role_link(
    session: AsyncSession, user_id: uuid.UUID
) -> UserRoleLink | None:
    role_id = await session.scalar(select(Role.id).where(Role.name == APP_ROLE))
    if role_id is None:
        raise AppException("App roles are not seeded yet", 503)
    return await session.get(UserRoleLink, (user_id, role_id))


async def drop_role_if_unneeded(
    session: AsyncSession, user_id: uuid.UUID, *, role_id: uuid.UUID | None = None
) -> bool:
    """Remove the role when the person holds no Printix access. Their Printix sessions
    end only if they can no longer sign in to Printix by another route (superuser, or
    ``app.printix.access`` through a role assignment). Serialised per person (the link
    has a composite primary key). Returns whether the role was removed."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    link = await session.get(
        UserRoleLink, (user_id, role_id or await _role_id(session))
    )
    if link is None or await holds_access(session, user_id):
        return False
    await session.delete(link)
    await session.flush()
    user = await session.get(User, user_id)
    still_eligible = user is not None and user.id in (
        await eligibility.eligible_user_ids_for_app(
            session=session, users=[user], app_key=APP_KEY
        )
    )
    if not still_eligible:
        now = utc_now()
        await session.execute(
            update(LoginSession)
            .where(
                LoginSession.user_id == user_id,
                LoginSession.app_name == APP_KEY,
                LoginSession.revoked_at.is_(None),
            )
            .values(revoked_at=now, updated_at=now)
        )
        await session.flush()
    logger.info("printix sign-in role removed", extra={"user_id": str(user_id)})
    return True
