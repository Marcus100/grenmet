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


async def release_lost(session: AsyncSession, candidates: Collection[uuid.UUID]) -> int:
    """Take ``printix-member`` (and live Printix sessions) from every candidate who no
    longer holds Printix access anywhere. Returns how many people lost the role."""
    removed = 0
    for user_id in sorted(candidates):
        if await drop_role_if_unneeded(session, user_id):
            removed += 1
    return removed


async def app_role_link(
    session: AsyncSession, user_id: uuid.UUID
) -> UserRoleLink | None:
    role_id = await session.scalar(select(Role.id).where(Role.name == APP_ROLE))
    if role_id is None:
        raise AppException("App roles are not seeded yet", 503)
    return await session.get(UserRoleLink, (user_id, role_id))


async def drop_role_if_unneeded(session: AsyncSession, user_id: uuid.UUID) -> bool:
    """Remove the role and end the person's Printix sessions when they hold no Printix
    access. Serialised per person (the link has a composite primary key)."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    link = await app_role_link(session, user_id)
    if link is None or await holds_access(session, user_id):
        return False
    await session.delete(link)
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
