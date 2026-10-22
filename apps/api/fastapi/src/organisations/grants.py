"""Membership grants and the organisation-permission resolver (ADR-0044, S1).

``effective_keys`` is the only place organisation-bound permission keys are
resolved. The global checks (``has_permission`` and friends) deny those keys on
purpose (``auth.policy.is_organisation_bound``); a member's keys come from:

* the implicit bundle of their ``MembershipRole`` (owner and admin hold every
  organisation key of every product; member holds none),
* plus the bundles of their live ``org.membership_grant`` rows,
* intersected with the products the organisation is entitled to.

There is no superuser bypass: callers pass the member's own membership.

Lifecycle functions flush but never commit; the router owns the transaction. The
audit actor is the grantor, so grant history commits with the change.
"""

import logging
import uuid
from collections.abc import Collection
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ColumnElement, false, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.permissions import ORGANISATION_BOUND_KEYS
from src.organisations import api_key_scopes, role_bundles
from src.organisations.exceptions import (
    GrantExpiryExceedsGrantorError,
    GrantExpiryInvalidError,
    GrantNotFoundError,
    GrantNotHeldError,
    MembershipNotFoundError,
    RoleAlreadyGrantedError,
    RoleBundleUnknownError,
    SelfGrantError,
)
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    OrganisationApp,
    new_grant_id,
)
from src.utils.datetime import utc_now

if TYPE_CHECKING:
    from src.organisations.dependencies import OrgContext

logger = logging.getLogger(__name__)


#: Every organisation key a product owns: bound keys minus API-key scope aliases.
#: Scope aliases (``bookings.read`` ...) are bounded by the creator of an API key
#: (ADR-0029), not by a member's roles.
_PRODUCT_KEYS: frozenset[str] = frozenset(
    ORGANISATION_BOUND_KEYS - set(api_key_scopes.all_scopes())
)


def product_keys() -> frozenset[str]:
    return _PRODUCT_KEYS


def is_product_key(permission_key: str) -> bool:
    return permission_key in product_keys()


async def entitled_products(session: AsyncSession, organisation_id: str) -> set[str]:
    rows = await session.scalars(
        select(OrganisationApp.app_key).where(
            OrganisationApp.organisation_id == organisation_id,
            OrganisationApp.enabled.is_(True),
        )
    )
    return set(rows.all())


def _live(now: datetime) -> list[ColumnElement[bool]]:
    return [
        MembershipGrant.revoked_at.is_(None),
        or_(MembershipGrant.expires_at.is_(None), MembershipGrant.expires_at > now),
    ]


async def effective_keys(
    session: AsyncSession, *, membership: Membership
) -> frozenset[str]:
    """The organisation keys ``membership`` holds now (empty unless it is active).

    The caller must have obtained ``membership`` through ``resolve_membership`` /
    ``OrgContext``: that is where a suspended organisation is refused; this
    function does not check the organisation's status."""
    if membership.status != MembershipStatus.ACTIVE.value:
        return frozenset()
    keys: set[str] = set()
    if membership.role in (MembershipRole.OWNER.value, MembershipRole.ADMIN.value):
        keys |= product_keys()
    role_keys = await session.scalars(
        select(MembershipGrant.role_key).where(
            MembershipGrant.membership_id == membership.id,
            MembershipGrant.organisation_id == membership.organisation_id,
            *_live(utc_now()),
        )
    )
    for role_key in role_keys.all():
        bundle = role_bundles.bundle_keys(role_key)
        if bundle is None:
            logger.warning(
                "Grant names a role bundle that no longer exists",
                extra={"membership_id": membership.id, "role_key": role_key},
            )
            continue
        keys |= bundle
    if not keys:
        return frozenset()
    entitled = await entitled_products(session, membership.organisation_id)
    return frozenset(k for k in keys if role_bundles.product_of_key(k) in entitled)


async def has_org_permission(
    session: AsyncSession, *, membership: Membership, permission_key: str
) -> bool:
    if not is_product_key(permission_key):
        return False
    return permission_key in await effective_keys(session, membership=membership)


def required_keys(bundle: frozenset[str]) -> set[str]:
    return set(bundle) | {
        f"{role_bundles.product_of_key(key)}.team.manage" for key in bundle
    }


async def _require_may_change(
    session: AsyncSession, context: OrgContext, bundle: frozenset[str]
) -> None:
    """The grantor holds every key in the bundle and each product's team-manage key."""
    required = required_keys(bundle)
    held = await effective_keys(session, membership=context.membership)
    if not required <= held:
        logger.warning(
            "Role change refused: grantor does not hold the bundle",
            extra={
                "user_id": str(context.user.id),
                "organisation_id": context.organisation_id,
            },
        )
        raise GrantNotHeldError()


async def _expiry_ceiling(
    session: AsyncSession, membership: Membership, required: set[str]
) -> datetime | None:
    """Earliest moment the grantor stops holding ``required`` (``None`` = never).

    Owner and admin bundles are permanent. For each key the grantor relies on only
    through grants, the key lasts until its latest-expiring provider; a provider
    without expiry makes it permanent. The ceiling is the earliest such end."""
    if membership.role in (MembershipRole.OWNER.value, MembershipRole.ADMIN.value):
        return None
    rows = await session.execute(
        select(MembershipGrant.role_key, MembershipGrant.expires_at).where(
            MembershipGrant.membership_id == membership.id,
            MembershipGrant.organisation_id == membership.organisation_id,
            *_live(utc_now()),
        )
    )
    grants_held = [
        (bundle, expires)
        for role_key, expires in rows.all()
        if (bundle := role_bundles.bundle_keys(role_key)) is not None
    ]
    ceiling: datetime | None = None
    for key in required:
        providers = [expires for bundle, expires in grants_held if key in bundle]
        if not providers or None in providers:
            continue  # permanent (or not held; _require_may_change refuses first)
        ends = max(e for e in providers if e is not None)
        ceiling = ends if ceiling is None else min(ceiling, ends)
    return ceiling


async def grant_role(
    session: AsyncSession,
    context: OrgContext,
    *,
    membership_id: str,
    role_key: str,
    expires_at: datetime | None = None,
) -> MembershipGrant:
    """Give a member a role bundle. ``expires_at`` is UTC; a timezone-aware value
    is converted, a naive one is taken as UTC. A grantor whose own keys expire
    cannot grant beyond that expiry, and nobody can grant themselves a role."""
    bundle = role_bundles.bundle_keys(role_key)
    if bundle is None:
        raise RoleBundleUnknownError(role_key)
    now = utc_now()
    if expires_at is not None and expires_at.tzinfo is not None:
        # Columns are naive UTC (utc_now); normalise aware input.
        expires_at = expires_at.astimezone(UTC).replace(tzinfo=None)
    if expires_at is not None and expires_at <= now:
        raise GrantExpiryInvalidError()
    audit_service.set_actor(session, context.user.id)
    # Lock the target and the grantor rows (fixed order by id, so two grants cannot
    # deadlock). ``populate_existing`` refreshes the grantor's role and status, so a
    # grantor removed a moment ago cannot slip a grant past ``apply_removal``'s
    # ``revoke_issued_by``: removal holds the same row lock until it commits.
    locked = (
        await session.scalars(
            select(Membership)
            .where(
                Membership.id.in_([membership_id, context.membership.id]),
                Membership.organisation_id == context.organisation_id,
            )
            .order_by(Membership.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    rows = {m.id: m for m in locked}
    grantor = rows.get(context.membership.id)
    if grantor is None or grantor.status != MembershipStatus.ACTIVE.value:
        raise GrantNotHeldError()
    target = rows.get(membership_id)
    if target is None or target.status != MembershipStatus.ACTIVE.value:
        raise MembershipNotFoundError()
    if target.id == context.membership.id:
        raise SelfGrantError()
    await _require_may_change(session, context, bundle)
    ceiling = await _expiry_ceiling(session, context.membership, required_keys(bundle))
    if ceiling is not None and (expires_at is None or expires_at > ceiling):
        raise GrantExpiryExceedsGrantorError()

    existing = await session.scalar(
        select(MembershipGrant)
        .where(
            MembershipGrant.membership_id == target.id,
            MembershipGrant.role_key == role_key,
            MembershipGrant.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if existing is not None:
        if existing.expires_at is None or existing.expires_at > now:
            raise RoleAlreadyGrantedError()
        # A lapsed grant still holds the unique slot (the partial index looks at
        # revoked_at only), so close it at its real end, not now, and keep it as
        # history before inserting the fresh row.
        existing.revoked_at = existing.expires_at
        await session.flush()

    grant = MembershipGrant(
        id=new_grant_id(),
        membership_id=target.id,
        organisation_id=context.organisation_id,
        role_key=role_key,
        granted_by=context.user.id,
        granted_at=now,
        expires_at=expires_at,
    )
    session.add(grant)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError:
        raise RoleAlreadyGrantedError() from None
    return grant


async def revoke_grant(
    session: AsyncSession, context: OrgContext, *, grant_id: str
) -> MembershipGrant:
    audit_service.set_actor(session, context.user.id)
    grant = await session.scalar(
        select(MembershipGrant)
        .where(
            MembershipGrant.id == grant_id,
            MembershipGrant.organisation_id == context.organisation_id,
        )
        .with_for_update()
    )
    if grant is None:
        raise GrantNotFoundError()
    bundle = role_bundles.bundle_keys(grant.role_key)
    if bundle is not None:
        await _require_may_change(session, context, bundle)
    else:
        # Renamed or retired role: still needs authority. Use the product's
        # team-manage key when the role_key prefix names one, else refuse.
        team_key = f"{grant.role_key.partition('-')[0]}.team.manage"
        if team_key not in product_keys() or team_key not in await effective_keys(
            session, membership=context.membership
        ):
            raise GrantNotHeldError()
    if grant.revoked_at is not None:
        return grant
    grant.revoked_at = utc_now()
    await session.flush()
    return grant


async def revoke_all_for_membership(
    session: AsyncSession, *, membership_id: str, actor_id: uuid.UUID
) -> None:
    """End every live grant of a membership (used when a member is removed, so a
    later re-invitation of the same row does not revive old roles)."""
    audit_service.set_actor(session, actor_id)
    live = await session.scalars(
        select(MembershipGrant).where(
            MembershipGrant.membership_id == membership_id,
            MembershipGrant.revoked_at.is_(None),
        )
    )
    now = utc_now()
    for grant in live.all():
        grant.revoked_at = now
    await session.flush()


async def revoke_issued_by(
    session: AsyncSession,
    *,
    organisation_id: str,
    user_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> int:
    """End every unrevoked grant ``user_id`` issued in the organisation (used when
    the issuer is removed, so access they handed out does not outlive their own).
    A lapsed grant is closed at its real end, a live one now. Returns the number of
    live grants ended. Direct grants only: grants issued by the people whose roles
    this ends are not followed (revocation is not transitive)."""
    audit_service.set_actor(session, actor_id)
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.granted_by == user_id,
            MembershipGrant.revoked_at.is_(None),
        )
        .with_for_update()
    )
    now = utc_now()
    ended = 0
    for grant in rows.all():
        if grant.expires_at is not None and grant.expires_at <= now:
            grant.revoked_at = grant.expires_at
            continue
        grant.revoked_at = now
        ended += 1
    await session.flush()
    return ended


async def list_issued_by(
    session: AsyncSession, *, organisation_id: str, user_id: uuid.UUID
) -> list[MembershipGrant]:
    """Live grants ``user_id`` issued in the organisation (review after a demotion)."""
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.granted_by == user_id,
            *_live(utc_now()),
        )
        .order_by(MembershipGrant.granted_at, MembershipGrant.id)
    )
    return list(rows.all())


async def list_grants(
    session: AsyncSession,
    *,
    organisation_id: str,
    membership_id: str,
    products: Collection[str] | None = None,
) -> list[MembershipGrant]:
    """Live grants of a membership. ``products`` limits the list to roles named
    ``<product>-...`` (the bundle naming rule); ``None`` lists all."""
    product_filter = (
        [or_(*(MembershipGrant.role_key.startswith(f"{p}-") for p in products))]
        if products is not None and products
        else [false()]
        if products is not None
        else []
    )
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.membership_id == membership_id,
            *_live(utc_now()),
            *product_filter,
        )
        .order_by(MembershipGrant.granted_at, MembershipGrant.id)
    )
    return list(rows.all())
