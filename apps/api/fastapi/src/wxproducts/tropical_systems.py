"""Tracked tropical systems: GMS identity across outlook issues.

``tropical_systems`` is the identity. ``tropical_system_entries`` is a derived
index of each outlook revision's systems: ``record_revision`` writes it in the
same transaction as the revision, and ``rebuild_entries`` recreates it from the
revisions alone, so the two must always agree (tested).

Public reads show published issues only: an entry is public when its product's
current published snapshot has the entry's revision, so a withdrawn issue
disappears without extra flags.
"""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Integer, Select, cast, delete, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import NotFoundError
from src.utils.timezones import GRENADA
from src.wxwatch.nhc_schemas import GuidanceFact, GuidanceSystem, ProductGuidance

from .exceptions import ProductValidationError, TropicalSystemConflict
from .models import (
    AuthoredProduct,
    ProductRevision,
    TropicalSystem,
    TropicalSystemChange,
    TropicalSystemEntry,
)
from .schemas import (
    NhcInvestId,
    NhcSystemId,
    TropicalSystemClosedReason,
    TropicalSystemCreate,
    TropicalSystemStatus,
    TropicalSystemUpdate,
)
from .validation import local_time

logger = logging.getLogger(__name__)

TRACKED_KIND = "outlook"
TRACKED_ACTIONS = ("draft", "publish")
HISTORY_LIMIT = 2000
# Speeds are stored in knots; NHC decoders already report kt.
TO_KNOTS = {
    None: 1.0,
    "kt": 1.0,
    "mph": 0.868976,
    "km/h": 1 / 1.852,
    "m/s": 1.943844,
}
UNIT_SPELLINGS = {
    "kt": "kt",
    "kts": "kt",
    "knot": "kt",
    "knots": "kt",
    "kn": "kt",
    "kns": "kt",
    "mph": "mph",
    "mi/h": "mph",
    "km/h": "km/h",
    "kph": "km/h",
    "kmh": "km/h",
    "km/hr": "km/h",
    "m/s": "m/s",
    "mps": "m/s",
    "m s-1": "m/s",
    "m s^-1": "m/s",
}
# Nothing moves faster than this; it also keeps the value inside numeric(5,1).
MAX_SPEED_KT = 500.0
# Advisory lock key for continuation edits; seasons (2000-2100) use their own key.
CHAIN_LOCK = -1


def _unit(unit: str | None) -> str | None:
    """Canonical speed unit, or "?" for a spelling nobody has defined."""
    if unit is None or not unit.strip():
        return None
    return UNIT_SPELLINGS.get(unit.strip().lower(), "?")


def _number(facts: list[GuidanceFact], *keys: str) -> float | None:
    for key in keys:
        for fact in facts:
            if fact.key == key and fact.value is not None:
                return fact.value
    return None


def _speed_kt(facts: list[GuidanceFact]) -> float | None:
    """Speed in knots, whatever its size. Live writes and rebuild share this."""
    for fact in facts:
        unit = _unit(fact.unit)
        if fact.key != "movement_speed" or unit == "?":
            continue
        value = next(
            (v for v in (fact.value, fact.maximum, fact.minimum) if v is not None),
            None,
        )
        if value is not None and value >= 0:
            return round(value * TO_KNOTS[unit], 1)
    return None


def _speed(facts: list[GuidanceFact]) -> float | None:
    """The stored speed. Live writes refuse an absurd one (``check_speeds``), so a
    rebuild of an older revision stores none instead of failing on it."""
    speed = _speed_kt(facts)
    return speed if speed is not None and speed <= MAX_SPEED_KT else None


def check_speeds(content: dict[str, Any]) -> None:
    """Reject speeds in an unknown unit or too large to be real (422)."""
    for system in tracked_systems(content):
        for fact in system.facts:
            if fact.key != "movement_speed":
                continue
            if _unit(fact.unit) == "?":
                raise ProductValidationError(
                    [
                        f"Unknown movement speed unit '{fact.unit}' for "
                        f"{system.name}; use kt, mph, km/h or m/s"
                    ]
                )
        speed = _speed_kt(system.facts)
        if speed is not None and speed > MAX_SPEED_KT:
            raise ProductValidationError(
                [f"Movement speed for {system.name} is above {MAX_SPEED_KT:g} kt"]
            )


def _chance(facts: list[GuidanceFact], horizon: int) -> int | None:
    for fact in facts:
        if (
            fact.key == "formation_probability"
            and fact.horizon_hours == horizon
            and fact.value is not None
        ):
            return round(fact.value)
    return None


def _direction(facts: list[GuidanceFact]) -> str | None:
    for fact in facts:
        if fact.key == "movement_direction":
            text_value = fact.description or fact.qualifier or fact.source_text
            if text_value:
                return text_value[:200]
            if fact.value is not None:
                return f"{fact.value:g} degrees"
    return None


def _guidance(content: dict[str, Any]) -> ProductGuidance | None:
    raw = content.get("guidance")
    if not raw:
        return None
    try:
        return ProductGuidance.model_validate(raw)
    except ValidationError:
        logger.warning("Ignoring unreadable outlook guidance in a revision")
        return None


def _issued_at(content: dict[str, Any], fallback: datetime) -> datetime:
    issued = (content.get("values") or {}).get("issuedAt") or ""
    try:
        return local_time(issued)
    except ValueError, TypeError:
        return fallback


def tracked_systems(content: dict[str, Any]) -> list[GuidanceSystem]:
    guidance = _guidance(content)
    if guidance is None:
        return []
    return [system for system in guidance.systems if system.tracked_system_id]


def entries_for(
    content: dict[str, Any],
    *,
    product_id: UUID,
    revision: int,
    action: str,
    created_at: datetime,
    storm_ids: dict[UUID | None, str | None] | None = None,
) -> list[dict[str, Any]]:
    """Entry rows for one outlook revision. Pure: rebuild and live writes share it.

    ``storm_ids`` is the NHC storm identifier each system had when the revision
    was saved; it is what the public routes show until a later outlook is saved.
    """
    issued_at = _issued_at(content, created_at)
    rows = []
    for system in tracked_systems(content):
        facts = system.facts
        rows.append(
            {
                "system_id": system.tracked_system_id,
                "product_id": product_id,
                "revision": revision,
                "action": action,
                "issued_at": issued_at,
                "name": system.name,
                "feature_type": system.feature_type,
                "nhc_storm_id": (storm_ids or {}).get(system.tracked_system_id),
                "latitude": _number(facts, "latitude"),
                "longitude": _number(facts, "longitude", "axis_longitude"),
                "movement_direction": _direction(facts),
                "movement_speed_kt": _speed(facts),
                "formation_48h": _chance(facts, 48),
                "formation_7d": _chance(facts, 168),
                "source_edition_ids": list(
                    dict.fromkeys(
                        fact.source_edition_id
                        for fact in facts
                        if fact.source_edition_id is not None
                    )
                ),
            }
        )
    return rows


def _published() -> Select[tuple[TropicalSystemEntry]]:
    """Entries whose revision is the product's current published snapshot."""
    return (
        select(TropicalSystemEntry)
        .join(AuthoredProduct, AuthoredProduct.id == TropicalSystemEntry.product_id)
        .where(
            TropicalSystemEntry.action == "publish",
            AuthoredProduct.published.is_not(None),
            cast(AuthoredProduct.published["revision"].astext, Integer)
            == TropicalSystemEntry.revision,
        )
    )


def _span(aggregate: Any) -> Any:
    return (
        _published()
        .with_only_columns(aggregate(TropicalSystemEntry.issued_at))
        .where(TropicalSystemEntry.system_id == TropicalSystem.id)
        .scalar_subquery()
    )


async def _lock_systems(
    session: AsyncSession, ids: set[UUID]
) -> dict[UUID, TropicalSystem]:
    """Lock systems FOR NO KEY UPDATE in id order and return them by id.

    This is the same strength the issue-time UPDATE needs, so nothing is ever
    upgraded, and the fixed order stops two publishes that link the same systems
    from waiting on each other.
    """
    if not ids:
        return {}
    rows = await session.execute(
        select(TropicalSystem)
        .where(TropicalSystem.id.in_(ids))
        .order_by(TropicalSystem.id)
        .with_for_update(key_share=True)
    )
    return {row.id: row for row in rows.scalars()}


async def _refresh_issue_times(session: AsyncSession, ids: set[UUID]) -> None:
    """first/last issued times span each system's entries still published.

    Withdrawn and superseded issues no longer count.
    """
    await _lock_systems(session, ids)
    statement = update(TropicalSystem).values(
        first_issued_at=_span(func.min), last_issued_at=_span(func.max)
    )
    if ids:
        statement = statement.where(TropicalSystem.id.in_(ids))
    await session.execute(statement)


async def _product_systems(session: AsyncSession, product_id: UUID) -> set[UUID]:
    """Systems any earlier revision of this product listed."""
    return set(
        (
            await session.execute(
                select(TropicalSystemEntry.system_id)
                .where(TropicalSystemEntry.product_id == product_id)
                .distinct()
            )
        ).scalars()
    )


async def _refresh_product(
    session: AsyncSession, product_id: UUID, extra: set[UUID]
) -> None:
    """Refresh issue times for a product's systems; a publish or withdraw moves them."""
    ids = await _product_systems(session, product_id) | extra
    if ids:
        await _refresh_issue_times(session, ids)


async def record_revision(
    session: AsyncSession,
    *,
    kind: str,
    product_id: UUID,
    revision: int,
    action: str,
    content: dict[str, Any],
    created_at: datetime,
) -> None:
    """Write entries for an outlook revision inside the caller's transaction."""
    if kind != TRACKED_KIND:
        return
    if action == "withdraw":
        # The product is no longer published, so its systems' issue times move.
        await _refresh_product(session, product_id, set())
        return
    if action not in TRACKED_ACTIONS:
        return
    check_speeds(content)
    linked = [
        system.tracked_system_id
        for system in tracked_systems(content)
        if system.tracked_system_id
    ]
    if not linked:
        if action == "publish":
            await _refresh_product(session, product_id, set())
        return
    if len(set(linked)) != len(linked):
        raise ProductValidationError(
            ["Each tracked system can appear only once in an outlook"]
        )
    # Lock everything this save will touch in one ordered statement, including the
    # systems the issue-time refresh updates, so concurrent saves queue in id order.
    locked = await _lock_systems(
        session, set(linked) | await _product_systems(session, product_id)
    )
    found = {
        system_id: locked[system_id] for system_id in linked if system_id in locked
    }
    missing = [str(system_id) for system_id in linked if system_id not in found]
    if missing:
        raise ProductValidationError(
            ["Tracked system not found: " + ", ".join(missing)]
        )
    closed = [row.label for row in found.values() if row.status == "closed"]
    if closed:
        raise ProductValidationError(
            [
                "Reopen the closed tracked system before linking it: "
                + ", ".join(sorted(closed))
            ]
        )
    rows = entries_for(
        content,
        product_id=product_id,
        revision=revision,
        action=action,
        created_at=created_at,
        storm_ids={system_id: row.nhc_storm_id for system_id, row in found.items()},
    )
    session.add_all(TropicalSystemEntry(**row) for row in rows)
    await session.flush()
    if action == "publish":
        await _refresh_product(session, product_id, set(found))


async def rebuild_entries(session: AsyncSession) -> int:
    """Recreate every entry from outlook revisions. The caller commits."""
    # The storm id each entry was saved with is not in the revision; keep it.
    kept = {
        (row.product_id, row.revision, row.system_id): row.nhc_storm_id
        for row in (await session.execute(select(TropicalSystemEntry))).scalars()
    }
    await session.execute(delete(TropicalSystemEntry))
    known = {
        row.id: row.nhc_storm_id
        for row in (await session.execute(select(TropicalSystem))).scalars()
    }
    revisions = await session.execute(
        select(
            ProductRevision.product_id,
            ProductRevision.revision,
            ProductRevision.action,
            ProductRevision.content,
            ProductRevision.created_at,
        )
        .join(AuthoredProduct, AuthoredProduct.id == ProductRevision.product_id)
        .where(
            AuthoredProduct.kind == TRACKED_KIND,
            ProductRevision.action.in_(TRACKED_ACTIONS),
        )
        .order_by(ProductRevision.id)
    )
    count = 0
    for row in revisions:
        entries = [
            entry
            for entry in entries_for(
                row.content,
                product_id=row.product_id,
                revision=row.revision,
                action=row.action,
                created_at=row.created_at,
            )
            if entry["system_id"] in known
        ]
        for entry in entries:
            entry["nhc_storm_id"] = kept.get(
                (entry["product_id"], entry["revision"], entry["system_id"]),
                known[entry["system_id"]],
            )
        session.add_all(TropicalSystemEntry(**entry) for entry in entries)
        count += len(entries)
    await session.flush()
    await _refresh_issue_times(session, set())
    logger.info("Tropical system entries rebuilt", extra={"entries": count})
    return count


def _actor(user: User) -> str:
    return str(user.id)


def _storm_conflict(error: IntegrityError) -> TropicalSystemConflict:
    detail = str(error.orig)
    if "tropical_systems_nhc_storm_idx" in detail:
        return TropicalSystemConflict(
            "Another tracked system already has this NHC storm identifier."
        )
    return TropicalSystemConflict("This tracked system changed. Reload it.")


async def create_system(
    session: AsyncSession, body: TropicalSystemCreate, actor: User
) -> TropicalSystem:
    season = body.season or datetime.now(GRENADA).year
    try:
        async with session.begin():
            # One sequence per season; the lock keeps concurrent creates in order.
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext('tropical_systems'), :s)"),
                {"s": season},
            )
            latest = await session.scalar(
                select(func.max(TropicalSystem.sequence)).where(
                    TropicalSystem.season == season
                )
            )
            sequence = (latest or 0) + 1
            if sequence > 999:
                raise TropicalSystemConflict("This season has no free system numbers.")
            system = TropicalSystem(
                id=uuid4(),
                season=season,
                sequence=sequence,
                name=body.name,
                feature_type=body.feature_type,
                nhc_storm_id=body.nhc_storm_id,
                nhc_invest_id=body.nhc_invest_id,
                status="active",
                created_by=_actor(actor),
                updated_by=_actor(actor),
            )
            session.add(system)
            await session.flush()
    except IntegrityError as error:
        raise _storm_conflict(error) from error
    await session.refresh(system)
    logger.info(
        "Tropical system tracked",
        extra={"system_id": str(system.id), "label": system.label},
    )
    return system


def cast_reason(value: str | None) -> TropicalSystemClosedReason | None:
    if value is None:
        return None
    return TypeAdapter(TropicalSystemClosedReason).validate_python(value)


def _closure(
    system: TropicalSystem, body: TropicalSystemUpdate
) -> tuple[TropicalSystemStatus, TropicalSystemClosedReason | None, UUID | None]:
    fields = body.model_fields_set
    if (body.status or system.status) == "active":
        if body.closed_reason is not None or body.continued_as_id is not None:
            raise ProductValidationError(
                ["An active system has no closing reason or continuation"]
            )
        return "active", None, None
    reason = (
        body.closed_reason
        if "closed_reason" in fields
        else cast_reason(system.closed_reason)
    )
    if reason is None:
        raise ProductValidationError(["Choose why the system is closed"])
    continued = (
        body.continued_as_id
        if "continued_as_id" in fields
        else system.continued_as_id
        if reason == "merged"
        else None
    )
    if reason == "merged" and continued is None:
        raise ProductValidationError(["Choose the system this one merged into"])
    if reason != "merged" and continued is not None:
        raise ProductValidationError(
            ["Only a merged system continues as another system"]
        )
    if continued == system.id:
        raise ProductValidationError(["A system cannot continue as itself"])
    return "closed", reason, continued


def _identity(system: TropicalSystem) -> dict[str, Any]:
    """The editable identity of a system, as stored in the change trail."""
    return {
        "name": system.name,
        "feature_type": system.feature_type,
        "nhc_storm_id": system.nhc_storm_id,
        "nhc_invest_id": system.nhc_invest_id,
        "status": system.status,
        "closed_reason": system.closed_reason,
        "continued_as_id": str(system.continued_as_id)
        if system.continued_as_id
        else None,
    }


async def _check_merge_target(
    session: AsyncSession, system: TropicalSystem, continued: UUID
) -> None:
    """Reject a missing target, a duplicate-closed one, or any continuation loop."""
    target = await session.get(TropicalSystem, continued)
    if target is None:
        raise ProductValidationError(["The merged-into system was not found"])
    if target.status == "closed" and target.closed_reason == "duplicate":
        raise ProductValidationError(
            ["Cannot merge into a system closed as a duplicate"]
        )
    seen = {system.id}
    step: TropicalSystem | None = target
    while step is not None:
        if step.id in seen:
            raise ProductValidationError(
                ["That merge would make systems continue as each other in a loop"]
            )
        seen.add(step.id)
        step = (
            await session.get(TropicalSystem, step.continued_as_id)
            if step.continued_as_id
            else None
        )


def _identifier(new: str | None, current: str | None, shape: Any) -> str | None:
    """Check an NHC identifier only when it changes.

    Rows saved before the season-year format (``al07``) can be echoed back in a
    PATCH unchanged; anything new or different must match the current format.
    """
    if new is None or new == current:
        return new
    try:
        return str(TypeAdapter(shape).validate_python(new))
    except ValidationError:
        raise ProductValidationError(
            [
                "NHC identifiers carry the season year, such as al072026 for a "
                "storm or al942026 for an invest"
            ]
        ) from None


async def update_system(
    session: AsyncSession, system_id: UUID, body: TropicalSystemUpdate, actor: User
) -> TropicalSystem:
    fields = body.model_fields_set
    try:
        async with session.begin():
            # Continuations are one chain across rows, so edits queue on one lock
            # before any row lock: two opposite merges cannot both pass the loop
            # check, and no lock order can deadlock (row locks come second).
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext('tropical_systems'), :k)"),
                {"k": CHAIN_LOCK},
            )
            system = (
                await session.execute(
                    select(TropicalSystem)
                    .where(TropicalSystem.id == system_id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if system is None:
                raise NotFoundError("Tracked system not found")
            status, reason, continued = _closure(system, body)
            if continued is not None and continued != system.continued_as_id:
                await _check_merge_target(session, system, continued)
            before = _identity(system)
            if body.name is not None:
                system.name = body.name
            if body.feature_type is not None:
                system.feature_type = body.feature_type
            if "nhc_storm_id" in fields:
                system.nhc_storm_id = _identifier(
                    body.nhc_storm_id, system.nhc_storm_id, NhcSystemId
                )
            if "nhc_invest_id" in fields:
                system.nhc_invest_id = _identifier(
                    body.nhc_invest_id, system.nhc_invest_id, NhcInvestId
                )
            system.status, system.closed_reason, system.continued_as_id = (
                status,
                reason,
                continued,
            )
            system.updated_by = _actor(actor)
            system.updated_at = func.now()
            after = _identity(system)
            if after != before:
                session.add(
                    TropicalSystemChange(
                        system_id=system.id,
                        actor_id=_actor(actor),
                        actor_name=actor.full_name or actor.email,
                        before=before,
                        after=after,
                        reason=body.reason,
                    )
                )
            await session.flush()
    except IntegrityError as error:
        raise _storm_conflict(error) from error
    await session.refresh(system)
    logger.info(
        "Tropical system updated",
        extra={"system_id": str(system.id), "status": system.status},
    )
    return system


async def list_systems(
    session: AsyncSession,
    *,
    status: TropicalSystemStatus | None,
    season: int | None,
    limit: int,
    offset: int,
) -> list[TropicalSystem]:
    statement = select(TropicalSystem)
    if status is not None:
        statement = statement.where(TropicalSystem.status == status)
    if season is not None:
        statement = statement.where(TropicalSystem.season == season)
    statement = (
        statement.order_by(TropicalSystem.season.desc(), TropicalSystem.sequence.desc())
        .limit(limit)
        .offset(offset)
    )
    return list((await session.execute(statement)).scalars())


async def get_system(session: AsyncSession, system_id: UUID) -> TropicalSystem:
    system = await session.get(TropicalSystem, system_id)
    if system is None:
        raise NotFoundError("Tracked system not found")
    return system


async def history(
    session: AsyncSession, system_id: UUID, *, published_only: bool
) -> list[TropicalSystemEntry]:
    statement = (_published() if published_only else select(TropicalSystemEntry)).where(
        TropicalSystemEntry.system_id == system_id
    )
    rows = list(
        (
            await session.execute(
                statement.order_by(
                    TropicalSystemEntry.issued_at.desc(),
                    TropicalSystemEntry.revision.desc(),
                    TropicalSystemEntry.id.desc(),
                ).limit(HISTORY_LIMIT)
            )
        ).scalars()
    )
    rows.reverse()
    return rows


async def public_active(
    session: AsyncSession, product_id: UUID, revision: int
) -> list[tuple[TropicalSystem, TropicalSystemEntry]]:
    """Systems listed in one published outlook issue, with that issue's entry.

    The caller passes the most recent current published outlook, so the public
    tracker lists exactly what the published product lists: renames and closures
    appear only once an outlook that reflects them is published.
    """
    rows = await session.execute(
        select(TropicalSystem, TropicalSystemEntry)
        .join(TropicalSystemEntry, TropicalSystemEntry.system_id == TropicalSystem.id)
        .where(
            TropicalSystemEntry.product_id == product_id,
            TropicalSystemEntry.revision == revision,
            TropicalSystemEntry.action == "publish",
        )
        .order_by(TropicalSystem.season.desc(), TropicalSystem.sequence.desc())
    )
    return [(row[0], row[1]) for row in rows]
