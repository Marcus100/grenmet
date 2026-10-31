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
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ColumnElement, false, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.permissions import ORGANISATION_BOUND_KEYS
from src.organisations import api_key_scopes, role_bundles
from src.organisations.exceptions import (
    GrantCascadeTooLargeError,
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


async def lock_roster(session: AsyncSession, organisation_id: str) -> None:
    """Lock every membership row of the organisation, in id order.

    Every change to an organisation's roles or grants takes this lock first, and
    then the rows it needs, so two such changes always lock in the same order and
    cannot deadlock (issue #528 L1). It serialises role and grant changes within one
    organisation only."""
    await session.execute(
        select(Membership.id)
        .where(Membership.organisation_id == organisation_id)
        .order_by(Membership.id)
        .with_for_update()
    )


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
    await lock_roster(session, context.organisation_id)
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


#: Most grants one revoke or role change may end through the cascade. Above this the
#: action is refused with 409 and nothing is ended, so one change cannot empty an
#: organisation by accident.
MAX_CASCADE_GRANTS = 200


@dataclass(frozen=True)
class GrantRevocation:
    """The revoked grant and how many grants the cascade ended after it."""

    grant: MembershipGrant
    cascaded: int


async def _live_grants(
    session: AsyncSession,
    organisation_id: str,
    now: datetime,
    products: Collection[str] | None = None,
) -> list[MembershipGrant]:
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            *_live(now),
            *_product_filter(products),
        )
        .order_by(MembershipGrant.id)
    )
    return list(rows.all())


async def _active_members(
    session: AsyncSession, organisation_id: str
) -> dict[str, Membership]:
    rows = await session.scalars(
        select(Membership).where(
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    return {m.id: m for m in rows.all()}


def _supported_grant_ids(
    members: dict[str, Membership], live: list[MembershipGrant]
) -> set[str]:
    """The live grants a chain of grants from an owner or admin still supports.

    A grantor holds a grant's keys only if they hold them through a supported grant
    of their own, or as an owner or admin (every key, marked ``None``). Entitlements
    are ignored on purpose: a switched-off product does not break a chain. A loop
    with no owner or admin at its root supports nothing."""
    by_user = {m.user_id: m for m in members.values()}
    held: dict[str, frozenset[str] | None] = {
        m.id: None
        for m in members.values()
        if m.role in (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)
    }
    supported: set[str] = set()
    progressed = True
    while progressed:
        progressed = False
        for grant in live:
            if grant.id in supported:
                continue
            if grant.granted_by is None:
                continue
            grantor = by_user.get(grant.granted_by)
            bundle = role_bundles.bundle_keys(grant.role_key)
            if grantor is None or bundle is None or grantor.id not in held:
                continue
            have = held[grantor.id]
            if have is not None and not required_keys(bundle) <= have:
                continue
            supported.add(grant.id)
            progressed = True
            recipient = grant.membership_id
            if recipient not in members:
                continue
            if recipient not in held:
                held[recipient] = frozenset(bundle)
            else:
                current = held[recipient]
                if current is not None:
                    held[recipient] = current | bundle
    return supported


def _downstream(
    members: dict[str, Membership],
    live: list[MembershipGrant],
    recipient_id: str,
) -> list[MembershipGrant]:
    """Live grants issued by ``recipient_id`` and, transitively, by whoever those grants
    went to. Each grant is listed once, so cycles end."""
    issued: dict[uuid.UUID, list[MembershipGrant]] = {}
    for grant in live:
        if grant.granted_by is not None:
            issued.setdefault(grant.granted_by, []).append(grant)
    out: list[MembershipGrant] = []
    seen_grants: set[str] = set()
    seen_members = {recipient_id}
    frontier = [recipient_id]
    while frontier:
        member = members.get(frontier.pop())
        if member is None:
            continue
        for grant in issued.get(member.user_id, []):
            if grant.id in seen_grants:
                continue
            seen_grants.add(grant.id)
            out.append(grant)
            if grant.membership_id not in seen_members:
                seen_members.add(grant.membership_id)
                frontier.append(grant.membership_id)
    return out


async def _end_cascaded(
    session: AsyncSession,
    grant: MembershipGrant,
    *,
    organisation_id: str,
    trigger: str,
    root: str,
    grantor_membership_id: str,
) -> None:
    """End one grant the cascade reached, audited with its trigger and root (#527)."""
    grant.revoked_at = utc_now()
    session.add(grant)
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation_id,
        record_type="organisation_membership_grant",
        record_id=grant.id,
        action="revoke_cascade",
        changes={
            "trigger": (None, trigger),
            "root": (None, root),
            "grantor_membership": (None, grantor_membership_id),
        },
        organisation_id=organisation_id,
    )


async def revoke_grant_detailed(
    session: AsyncSession, context: OrgContext, *, grant_id: str
) -> GrantRevocation:
    """Revoke a grant and every grant that depended on it (ADR-0044 S3, #527).

    A downstream grant is ended only when it loses support: no chain of supported
    grants from an owner or admin still reaches its grantor. Owners and admins are
    roots, so their grants survive. The check ignores entitlements. Stale callers are
    refused: the revoker's membership is re-read after the roster lock."""
    audit_service.set_actor(session, context.user.id)
    await lock_roster(session, context.organisation_id)
    revoker = await session.get(
        Membership, context.membership.id, populate_existing=True
    )
    if (
        revoker is None
        or revoker.organisation_id != context.organisation_id
        or revoker.status != MembershipStatus.ACTIVE.value
    ):
        raise GrantNotHeldError()
    context = replace(context, membership=revoker)
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
    if grant.membership_id == context.membership.id:
        # Nobody changes their own roles, in either direction (``grant_role`` too).
        raise SelfGrantError()
    bundle = role_bundles.bundle_keys(grant.role_key)
    if bundle is not None:
        await _require_may_change(session, context, bundle)
    else:
        # Renamed or retired role: still needs authority. Use the product's
        # team-manage key when the role_key prefix names one, else refuse.
        # Product keys contain no "-" (registry test), so the text before the first
        # "-" is the whole product key, matching ``_product_filter``.
        team_key = f"{grant.role_key.partition('-')[0]}.team.manage"
        if team_key not in product_keys() or team_key not in await effective_keys(
            session, membership=context.membership
        ):
            raise GrantNotHeldError()
    if grant.revoked_at is not None:
        return GrantRevocation(grant=grant, cascaded=0)

    now = utc_now()
    was_live = grant.expires_at is None or grant.expires_at > now
    organisation_id = context.organisation_id
    candidates: list[MembershipGrant] = []
    if was_live:
        members = await _active_members(session, organisation_id)
        before = await _live_grants(session, organisation_id, now)
        candidates = _downstream(members, before, grant.membership_id)
    grant.revoked_at = now
    await session.flush()
    victims: list[MembershipGrant] = []
    if was_live:
        members = await _active_members(session, organisation_id)
        supported = _supported_grant_ids(
            members, await _live_grants(session, organisation_id, now)
        )
        victims = [c for c in candidates if c.id != grant.id and c.id not in supported]
        if len(victims) > MAX_CASCADE_GRANTS:
            raise GrantCascadeTooLargeError(MAX_CASCADE_GRANTS)
        for victim in victims:
            await _end_cascaded(
                session,
                victim,
                organisation_id=organisation_id,
                trigger="grant_revoked",
                root=grant.id,
                grantor_membership_id=_grantor_membership(members, victim),
            )
        await session.flush()
    logger.info(
        "organisation grant revoked",
        extra={"organisation_id": organisation_id, "cascaded": len(victims)},
    )
    return GrantRevocation(grant=grant, cascaded=len(victims))


def _grantor_membership(members: dict[str, Membership], grant: MembershipGrant) -> str:
    for member in members.values():
        if member.user_id == grant.granted_by:
            return member.id
    return ""


async def revoke_grant(
    session: AsyncSession, context: OrgContext, *, grant_id: str
) -> MembershipGrant:
    return (await revoke_grant_detailed(session, context, grant_id=grant_id)).grant


async def issued_recipient_ids(
    session: AsyncSession,
    *,
    organisation_id: str,
    user_id: uuid.UUID,
    products: Collection[str] | None = None,
) -> list[str]:
    """Membership ids of the people holding live grants that ``user_id`` issued here.

    Read before those grants are ended, so the cascade can start from them."""
    rows = await session.scalars(
        select(MembershipGrant.membership_id)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.granted_by == user_id,
            *_live(utc_now()),
            *_product_filter(products),
        )
        .distinct()
    )
    return list(rows.all())


async def end_issued_transitively(
    session: AsyncSession,
    *,
    organisation_id: str,
    seed_membership_ids: Collection[str],
    actor_id: uuid.UUID,
    trigger: str,
    root: str,
    products: Collection[str] | None = None,
) -> int:
    """End every live grant the seed members issued, then every grant their recipients
    issued, transitively (ADR-0044 S3, #527). Returns the grants ended.

    Used when a member is demoted or removed. Owners and admins are never traversed,
    neither as seeds nor as recipients: their keys come from their role and their own
    grants stay. Each end is audited with its trigger and root. Callers hold the roster
    lock and this function flushes."""
    audit_service.set_actor(session, actor_id)
    now = utc_now()
    members_rows = await session.scalars(
        select(Membership).where(Membership.organisation_id == organisation_id)
    )
    members = {m.id: m for m in members_rows.all()}
    live = await _live_grants(session, organisation_id, now, products)
    issued: dict[uuid.UUID, list[MembershipGrant]] = {}
    for grant in live:
        if grant.granted_by is not None:
            issued.setdefault(grant.granted_by, []).append(grant)
    frontier = list(dict.fromkeys(seed_membership_ids))
    seen_members = set(frontier)
    seen_grants: set[str] = set()
    ended = 0
    privileged = (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)
    while frontier:
        member = members.get(frontier.pop())
        if member is None:
            continue
        if member.status == MembershipStatus.ACTIVE.value and member.role in privileged:
            continue
        for grant in issued.get(member.user_id, []):
            if grant.id in seen_grants:
                continue
            seen_grants.add(grant.id)
            ended += 1
            if ended > MAX_CASCADE_GRANTS:
                raise GrantCascadeTooLargeError(MAX_CASCADE_GRANTS)
            await _end_cascaded(
                session,
                grant,
                organisation_id=organisation_id,
                trigger=trigger,
                root=root,
                grantor_membership_id=member.id,
            )
            if grant.membership_id not in seen_members:
                seen_members.add(grant.membership_id)
                frontier.append(grant.membership_id)
    await session.flush()
    return ended


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
    products: Collection[str] | None = None,
) -> int:
    """End every unrevoked grant ``user_id`` issued in the organisation (used when
    the issuer is removed, so access they handed out does not outlive their own).
    A lapsed grant is closed at its real end, a live one now. Returns the number of
    live grants ended. ``products`` limits it to those products' roles. Direct
    grants only: the caller follows the people they granted to through
    ``revoke_dependent_grants``."""
    audit_service.set_actor(session, actor_id)
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.granted_by == user_id,
            MembershipGrant.revoked_at.is_(None),
            *_product_filter(products),
        )
        .with_for_update()
    )
    ended = _end_grants(rows.all())
    await session.flush()
    return ended


def _end_grants(grant_rows: Collection[MembershipGrant]) -> int:
    """Revoke grants (the caller flushes): lapsed ones at their real end, live ones
    now. Returns the number of live grants ended."""
    now = utc_now()
    ended = 0
    for grant in grant_rows:
        if grant.expires_at is not None and grant.expires_at <= now:
            grant.revoked_at = grant.expires_at
            continue
        grant.revoked_at = now
        ended += 1
    return ended


async def revoke_product_grants(
    session: AsyncSession,
    *,
    organisation_id: str,
    membership_id: str,
    products: Collection[str],
    actor_id: uuid.UUID,
) -> int:
    """End a member's live grants for ``products`` (their roles only; the membership
    and other products stay). Returns the number of live grants ended (ADR-0016
    amendment: an Events session removal ends the person's Events roles only)."""
    audit_service.set_actor(session, actor_id)
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.membership_id == membership_id,
            MembershipGrant.revoked_at.is_(None),
            *_product_filter(products),
        )
        .with_for_update()
    )
    ended = _end_grants(rows.all())
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


def _product_filter(products: Collection[str] | None) -> list[ColumnElement[bool]]:
    if products is None:
        return []
    if not products:
        return [false()]
    return [
        or_(
            *(
                MembershipGrant.role_key.startswith(f"{p}-", autoescape=True)
                for p in products
            )
        )
    ]


async def list_grants_for_memberships(
    session: AsyncSession,
    *,
    organisation_id: str,
    membership_ids: Collection[str],
    products: Collection[str],
) -> dict[str, list[MembershipGrant]]:
    """Live grants of many memberships in one query, limited to ``products``
    (same rule as ``list_grants``), keyed by membership id."""
    result: dict[str, list[MembershipGrant]] = {m: [] for m in membership_ids}
    if not membership_ids:
        return result
    rows = await session.scalars(
        select(MembershipGrant)
        .where(
            MembershipGrant.organisation_id == organisation_id,
            MembershipGrant.membership_id.in_(list(membership_ids)),
            *_live(utc_now()),
            *_product_filter(products),
        )
        .order_by(MembershipGrant.granted_at, MembershipGrant.id)
    )
    for row in rows.all():
        result[row.membership_id].append(row)
    return result


async def list_grants(
    session: AsyncSession,
    *,
    organisation_id: str,
    membership_id: str,
    products: Collection[str] | None = None,
) -> list[MembershipGrant]:
    """Live grants of a membership. ``products`` limits the list to roles named
    ``<product>-...`` (the bundle naming rule); ``None`` lists all."""
    product_filter = _product_filter(products)
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
