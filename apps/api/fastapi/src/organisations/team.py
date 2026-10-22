"""Team-management service for membership grants (ADR-0044, S3).

Reads and writes behind the ``/organisations/org/...`` grant routes. The rules
(self-grant refusal, expiry cap, the grantor holding the bundle and the product's
``team.manage``, retired-role revoke) live in ``grants.py`` and are not repeated
here. This module adds the read models (display names only, never emails),
conflict mapping, and the issued-grants review list. Functions flush; the router
commits and rolls back on error.
"""

import logging
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.auth.models import User
from src.exceptions import AppException
from src.organisations import grants, role_bundles
from src.organisations.dependencies import OrgContext
from src.organisations.exceptions import (
    GrantConflictError,
    MembershipNotFoundError,
)
from src.organisations.models import Membership, MembershipGrant, MembershipStatus
from src.organisations.schemas import MembershipGrantPublic, RoleBundlePublic

logger = logging.getLogger(__name__)

# Postgres: unique_violation, deadlock_detected, serialization_failure. Any other
# integrity error is a bug, not a lost race: it surfaces as a 500.
_CONFLICT_SQLSTATES = frozenset({"23505", "40P01", "40001"})


def _sqlstate(exc: DBAPIError) -> str | None:
    orig = exc.orig
    for candidate in (orig, getattr(orig, "__cause__", None)):
        for attr in ("sqlstate", "pgcode"):
            code = getattr(candidate, attr, None)
            if isinstance(code, str):
                return code
    return None


@asynccontextmanager
async def conflicts_as_409() -> AsyncIterator[None]:
    """Map lost races (unique violation, deadlock, serialization failure) to 409."""
    try:
        yield
    except DBAPIError as exc:  # IntegrityError is a subclass
        state = _sqlstate(exc)
        if state in _CONFLICT_SQLSTATES:
            raise GrantConflictError() from None
        logger.error("Unexpected database error", extra={"sqlstate": state})
        raise


async def run_and_commit[T](session: AsyncSession, work: Awaitable[T]) -> T:
    """Await ``work`` and commit; lost races become 409 and any ``AppException``
    rolls the transaction back before it propagates."""
    try:
        async with conflicts_as_409():
            result = await work
            await session.commit()
    except AppException:
        await session.rollback()
        raise
    return result


def _name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name.strip() or "Member"


def _public(
    grant: MembershipGrant, member: User, granter: User | None
) -> MembershipGrantPublic:
    return MembershipGrantPublic(
        id=grant.id,
        membership_id=grant.membership_id,
        member_name=_name(member) or "Member",
        role_key=grant.role_key,
        granted_by_name=_name(granter),
        granted_at=grant.granted_at,
        expires_at=grant.expires_at,
        revoked_at=grant.revoked_at,
    )


async def _active_membership(
    session: AsyncSession, organisation_id: str, membership_id: str
) -> Membership:
    membership = await session.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    if membership is None:
        raise MembershipNotFoundError()
    return membership


async def list_bundles(
    session: AsyncSession, context: OrgContext
) -> list[RoleBundlePublic]:
    """Bundles of the products the organisation is entitled to."""
    entitled = await grants.entitled_products(session, context.organisation_id)
    held = await grants.effective_keys(session, membership=context.membership)
    result: list[RoleBundlePublic] = []
    for role_key, keys in sorted(role_bundles.ROLE_BUNDLES.items()):
        products = {role_bundles.product_of_key(k) for k in keys}
        if not products <= entitled:
            continue
        required = grants.required_keys(keys)
        result.append(
            RoleBundlePublic(
                role_key=role_key,
                product=sorted(products)[0],
                permissions=sorted(keys),
                grantable=required <= held,
            )
        )
    return result


async def list_member_grants(
    session: AsyncSession, context: OrgContext, *, membership_id: str
) -> list[MembershipGrantPublic]:
    await _active_membership(session, context.organisation_id, membership_id)
    held = await grants.effective_keys(session, membership=context.membership)
    # Only products whose team-manage key the caller holds (owner and admin: every
    # entitled product); a lead never reads another product's roles.
    products = {
        role_bundles.product_of_key(k) for k in held if k.endswith(".team.manage")
    }
    live = await grants.list_grants(
        session,
        organisation_id=context.organisation_id,
        membership_id=membership_id,
        products=products,
    )
    return await _to_public(session, live)


async def _to_public(
    session: AsyncSession, rows: list[MembershipGrant]
) -> list[MembershipGrantPublic]:
    """Attach display names with one query (members and grantors)."""
    if not rows:
        return []
    granter = aliased(User)
    names = await session.execute(
        select(MembershipGrant.id, User, granter)
        .join(Membership, Membership.id == MembershipGrant.membership_id)
        .join(User, User.id == Membership.user_id)
        .outerjoin(granter, granter.id == MembershipGrant.granted_by)
        .where(MembershipGrant.id.in_([r.id for r in rows]))
    )
    by_id = {gid: (member, by) for gid, member, by in names.all()}
    return [_public(r, *by_id[r.id]) for r in rows]


async def list_issued(
    session: AsyncSession, context: OrgContext, *, membership_id: str
) -> list[MembershipGrantPublic]:
    """Live grants issued by the person behind ``membership_id`` (any status), for
    admins reviewing a demoted member's handouts. Direct grants only: grants made
    by the people they granted to are not followed."""
    membership = await session.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.organisation_id == context.organisation_id,
        )
    )
    if membership is None:
        raise MembershipNotFoundError()
    rows = await grants.list_issued_by(
        session, organisation_id=context.organisation_id, user_id=membership.user_id
    )
    return await _to_public(session, rows)


async def grant(
    session: AsyncSession,
    context: OrgContext,
    *,
    membership_id: str,
    role_key: str,
    expires_at: datetime | None,
) -> MembershipGrantPublic:
    async with conflicts_as_409():
        row = await grants.grant_role(
            session,
            context,
            membership_id=membership_id,
            role_key=role_key,
            expires_at=expires_at,
        )
    return (await _to_public(session, [row]))[0]


async def revoke(
    session: AsyncSession, context: OrgContext, *, grant_id: str
) -> MembershipGrantPublic:
    async with conflicts_as_409():
        row = await grants.revoke_grant(session, context, grant_id=grant_id)
    return (await _to_public(session, [row]))[0]
