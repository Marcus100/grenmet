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
    TropicalSystemEntry,
)
from .schemas import (
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
TO_KNOTS = {None: 1.0, "kt": 1.0, "mph": 0.868976, "km/h": 1 / 1.852}


def _number(facts: list[GuidanceFact], *keys: str) -> float | None:
    for key in keys:
        for fact in facts:
            if fact.key == key and fact.value is not None:
                return fact.value
    return None


def _speed(facts: list[GuidanceFact]) -> float | None:
    for fact in facts:
        if fact.key != "movement_speed" or fact.unit not in TO_KNOTS:
            continue
        value = next(
            (v for v in (fact.value, fact.maximum, fact.minimum) if v is not None),
            None,
        )
        if value is not None and value >= 0:
            return round(value * TO_KNOTS[fact.unit], 1)
    return None


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
) -> list[dict[str, Any]]:
    """Entry rows for one outlook revision. Pure: rebuild and live writes share it."""
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


def _span(aggregate: Any) -> Any:
    return (
        select(aggregate(TropicalSystemEntry.issued_at))
        .where(
            TropicalSystemEntry.system_id == TropicalSystem.id,
            TropicalSystemEntry.action == "publish",
        )
        .scalar_subquery()
    )


async def _refresh_issue_times(session: AsyncSession, ids: set[UUID]) -> None:
    """first/last issued times are the span of each system's published entries."""
    statement = update(TropicalSystem).values(
        first_issued_at=_span(func.min), last_issued_at=_span(func.max)
    )
    if ids:
        statement = statement.where(TropicalSystem.id.in_(ids))
    await session.execute(statement)


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
    if kind != TRACKED_KIND or action not in TRACKED_ACTIONS:
        return
    linked = [system.tracked_system_id for system in tracked_systems(content)]
    if not linked:
        return
    if len(set(linked)) != len(linked):
        raise ProductValidationError(
            ["Each tracked system can appear only once in an outlook"]
        )
    found = {
        row.id: row
        for row in (
            await session.execute(
                select(TropicalSystem).where(TropicalSystem.id.in_(linked))
            )
        ).scalars()
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
    )
    session.add_all(TropicalSystemEntry(**row) for row in rows)
    await session.flush()
    if action == "publish":
        await _refresh_issue_times(session, set(found))


async def rebuild_entries(session: AsyncSession) -> int:
    """Recreate every entry from outlook revisions. The caller commits."""
    await session.execute(delete(TropicalSystemEntry))
    known = set((await session.execute(select(TropicalSystem.id))).scalars())
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


async def update_system(
    session: AsyncSession, system_id: UUID, body: TropicalSystemUpdate, actor: User
) -> TropicalSystem:
    fields = body.model_fields_set
    try:
        async with session.begin():
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
                target = await session.get(TropicalSystem, continued)
                if target is None:
                    raise ProductValidationError(
                        ["The merged-into system was not found"]
                    )
                if target.continued_as_id == system.id:
                    raise ProductValidationError(
                        ["Two systems cannot continue as each other"]
                    )
            if body.name is not None:
                system.name = body.name
            if body.feature_type is not None:
                system.feature_type = body.feature_type
            if "nhc_storm_id" in fields:
                system.nhc_storm_id = body.nhc_storm_id
            if "nhc_invest_id" in fields:
                system.nhc_invest_id = body.nhc_invest_id
            system.status, system.closed_reason, system.continued_as_id = (
                status,
                reason,
                continued,
            )
            system.updated_by = _actor(actor)
            system.updated_at = func.now()
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
    session: AsyncSession,
) -> list[tuple[TropicalSystem, TropicalSystemEntry]]:
    latest = (
        _published()
        .join(TropicalSystem, TropicalSystem.id == TropicalSystemEntry.system_id)
        .where(TropicalSystem.status == "active")
        .distinct(TropicalSystemEntry.system_id)
        .order_by(
            TropicalSystemEntry.system_id,
            TropicalSystemEntry.issued_at.desc(),
            TropicalSystemEntry.revision.desc(),
        )
        .subquery()
    )
    rows = await session.execute(
        select(TropicalSystem, TropicalSystemEntry)
        .join(latest, latest.c.system_id == TropicalSystem.id)
        .join(TropicalSystemEntry, TropicalSystemEntry.id == latest.c.id)
        .order_by(TropicalSystem.season.desc(), TropicalSystem.sequence.desc())
    )
    return [(row[0], row[1]) for row in rows]
