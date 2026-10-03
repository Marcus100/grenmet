"""Shift patterns, zones and who works which zone on which shift.

Patterns are per site. A zone is a named group of areas within one site; a
supervisor may only manage zones whose areas all sit in buildings they hold.
Assignments are cancelled rather than deleted.
"""

import logging
from collections import defaultdict
from datetime import date, time, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError, NotFoundError
from src.janitorial import access, history
from src.janitorial.models import (
    Area,
    Building,
    ShiftAssignment,
    ShiftPattern,
    Site,
    Staff,
    Zone,
    ZoneArea,
)

from . import schemas

logger = logging.getLogger(__name__)

MAX_RANGE_DAYS = 62


def _clock(value: time) -> str:
    return value.strftime("%H:%M")


def _parse_clock(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def _pattern(pattern: ShiftPattern) -> schemas.JanitorialShiftPattern:
    return schemas.JanitorialShiftPattern(
        id=pattern.id,
        siteId=pattern.site_id,
        name=pattern.name,
        startsAt=_clock(pattern.starts_at),
        endsAt=_clock(pattern.ends_at),
        active=pattern.active,
        revision=pattern.revision,
    )


def _zone(zone: Zone, area_ids: list[int]) -> schemas.JanitorialZone:
    return schemas.JanitorialZone(
        id=zone.id,
        siteId=zone.site_id,
        name=zone.name,
        areaIds=sorted(area_ids),
        active=zone.active,
        revision=zone.revision,
    )


def _assignment(row: ShiftAssignment) -> schemas.JanitorialShiftAssignment:
    return schemas.JanitorialShiftAssignment(
        id=row.id,
        workDate=row.work_date,
        shiftPatternId=row.shift_pattern_id,
        staffId=row.staff_id,
        zoneId=row.zone_id,
        status=row.status,  # type: ignore[arg-type]
        note=row.note,
        revision=row.revision,
    )


async def _site(session: AsyncSession, code: str) -> Site:
    site = await session.scalar(select(Site).where(Site.code == code.upper()))
    if site is None:
        raise NotFoundError("Site not found")
    return site


async def _zone_areas(
    session: AsyncSession, zone_ids: list[int]
) -> dict[int, list[int]]:
    result: dict[int, list[int]] = defaultdict(list)
    rows = await session.execute(
        select(ZoneArea.zone_id, ZoneArea.area_id).where(ZoneArea.zone_id.in_(zone_ids))
    )
    for zone_id, area_id in rows:
        result[zone_id].append(area_id)
    return result


async def board(
    session: AsyncSession, user: User, site: str, start: date, end: date
) -> schemas.JanitorialShiftBoard:
    access.require_view(user)
    if end < start or (end - start) > timedelta(days=MAX_RANGE_DAYS):
        raise AppValidationError(
            f"Choose a date range of at most {MAX_RANGE_DAYS} days"
        )
    target = await _site(session, site)
    patterns = await session.scalars(
        select(ShiftPattern)
        .where(ShiftPattern.site_id == target.id)
        .order_by(ShiftPattern.sort_order, ShiftPattern.starts_at, ShiftPattern.id)
    )
    zones = list(
        await session.scalars(
            select(Zone).where(Zone.site_id == target.id).order_by(Zone.name)
        )
    )
    members = await _zone_areas(session, [zone.id for zone in zones])

    scope = await access.building_scope(session, user)
    if scope is not None:
        area_buildings = dict(
            (
                await session.execute(
                    select(Area.id, Area.building_id).where(
                        Area.id.in_(
                            [area for areas in members.values() for area in areas]
                        )
                    )
                )
            )
            .tuples()
            .all()
        )
        zones = [
            zone
            for zone in zones
            if members[zone.id]
            and all(area_buildings[area] in scope for area in members[zone.id])
        ]
    visible = [zone.id for zone in zones]
    assignments = await session.scalars(
        select(ShiftAssignment)
        .where(
            ShiftAssignment.zone_id.in_(visible),
            ShiftAssignment.work_date.between(start, end),
        )
        .order_by(ShiftAssignment.work_date, ShiftAssignment.shift_pattern_id)
    )
    return schemas.JanitorialShiftBoard(
        patterns=[_pattern(pattern) for pattern in patterns],
        zones=[_zone(zone, members[zone.id]) for zone in zones],
        assignments=[_assignment(row) for row in assignments],
    )


# --- Shift patterns --------------------------------------------------------


async def create_pattern(
    session: AsyncSession, user: User, payload: schemas.ShiftPatternCreate
) -> schemas.JanitorialShiftPattern:
    access.require_shifts(user)
    if await session.get(Site, payload.siteId) is None:
        raise NotFoundError("Site not found")
    sort_order = await session.scalar(
        select(func.coalesce(func.max(ShiftPattern.sort_order), -1)).where(
            ShiftPattern.site_id == payload.siteId
        )
    )
    pattern = ShiftPattern(
        site_id=payload.siteId,
        name=payload.name,
        starts_at=_parse_clock(payload.startsAt),
        ends_at=_parse_clock(payload.endsAt),
        sort_order=(sort_order or 0) + 1,
    )
    if pattern.starts_at == pattern.ends_at:
        raise AppValidationError("A shift must end at a different time")
    session.add(pattern)
    await history.flush(session, f"A shift named {payload.name} already exists")
    history.record(
        session,
        entity="shift_pattern",
        entity_id=pattern.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, payload.name]},
    )
    await history.commit(session, f"A shift named {payload.name} already exists")
    return _pattern(pattern)


async def update_pattern(
    session: AsyncSession,
    user: User,
    pattern_id: int,
    payload: schemas.ShiftPatternUpdate,
) -> schemas.JanitorialShiftPattern:
    access.require_shifts(user)
    pattern = await session.get(ShiftPattern, pattern_id, with_for_update=True)
    if pattern is None:
        raise NotFoundError("Shift not found")
    history.check_revision(pattern, payload.expectedRevision)
    starts_at, ends_at = _parse_clock(payload.startsAt), _parse_clock(payload.endsAt)
    if starts_at == ends_at:
        raise AppValidationError("A shift must end at a different time")
    changes = history.apply(
        pattern,
        {
            "name": payload.name,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "active": payload.active,
        },
    )
    if changes:
        pattern.revision += 1
        history.record(
            session,
            entity="shift_pattern",
            entity_id=pattern.id,
            revision=pattern.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, f"A shift named {payload.name} already exists")
    return _pattern(pattern)


# --- Zones -----------------------------------------------------------------


async def _check_zone_areas(
    session: AsyncSession, user: User, site_id: int, area_ids: set[int]
) -> None:
    if not area_ids:
        return
    sites = dict(
        (
            await session.execute(
                select(Area.id, Building.site_id)
                .join(Building, Building.id == Area.building_id)
                .where(Area.id.in_(area_ids))
            )
        )
        .tuples()
        .all()
    )
    if set(sites) != area_ids:
        raise NotFoundError("Area not found")
    if any(value != site_id for value in sites.values()):
        raise AppValidationError("A zone's areas must all be at the zone's site")
    await access.require_areas(session, user, area_ids)


async def _set_zone_areas(
    session: AsyncSession, zone_id: int, area_ids: set[int]
) -> None:
    await session.execute(delete(ZoneArea).where(ZoneArea.zone_id == zone_id))
    session.add_all(ZoneArea(zone_id=zone_id, area_id=area) for area in area_ids)


async def create_zone(
    session: AsyncSession, user: User, payload: schemas.ZoneCreate
) -> schemas.JanitorialZone:
    access.require_shifts(user)
    if await session.get(Site, payload.siteId) is None:
        raise NotFoundError("Site not found")
    area_ids = set(payload.areaIds)
    await _check_zone_areas(session, user, payload.siteId, area_ids)
    zone = Zone(site_id=payload.siteId, name=payload.name)
    session.add(zone)
    await history.flush(session, f"A zone named {payload.name} already exists")
    await _set_zone_areas(session, zone.id, area_ids)
    history.record(
        session,
        entity="zone",
        entity_id=zone.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, payload.name], "areaIds": [None, sorted(area_ids)]},
    )
    await history.commit(session, f"A zone named {payload.name} already exists")
    return _zone(zone, list(area_ids))


async def update_zone(
    session: AsyncSession, user: User, zone_id: int, payload: schemas.ZoneUpdate
) -> schemas.JanitorialZone:
    access.require_shifts(user)
    zone = await session.get(Zone, zone_id, with_for_update=True)
    if zone is None:
        raise NotFoundError("Zone not found")
    await access.require_zone(session, user, zone_id)
    history.check_revision(zone, payload.expectedRevision)
    area_ids = set(payload.areaIds)
    await _check_zone_areas(session, user, zone.site_id, area_ids)
    current = set((await _zone_areas(session, [zone_id]))[zone_id])
    changes = history.apply(zone, {"name": payload.name, "active": payload.active})
    if current != area_ids:
        changes["areaIds"] = [sorted(current), sorted(area_ids)]
        await _set_zone_areas(session, zone_id, area_ids)
    if changes:
        zone.revision += 1
        history.record(
            session,
            entity="zone",
            entity_id=zone.id,
            revision=zone.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, f"A zone named {payload.name} already exists")
    return _zone(zone, list(area_ids))


# --- Assignments -----------------------------------------------------------


async def _check_assignment(
    session: AsyncSession, user: User, pattern_id: int, zone_id: int
) -> None:
    pattern = await session.get(ShiftPattern, pattern_id)
    zone = await session.get(Zone, zone_id)
    if pattern is None or not pattern.active:
        raise NotFoundError("Shift not found")
    if zone is None or not zone.active:
        raise NotFoundError("Zone not found")
    if pattern.site_id != zone.site_id:
        raise AppValidationError("The shift and zone must be at the same site")
    await access.require_zone(session, user, zone_id)


DOUBLE_BOOKED = "That person is already scheduled for this shift"


async def create_assignment(
    session: AsyncSession, user: User, payload: schemas.ShiftAssignmentCreate
) -> schemas.JanitorialShiftAssignment:
    access.require_shifts(user)
    await _check_assignment(session, user, payload.shiftPatternId, payload.zoneId)
    member = await session.get(Staff, payload.staffId)
    if member is None or not member.active:
        raise NotFoundError("Staff member not found")
    row = ShiftAssignment(
        work_date=payload.workDate,
        shift_pattern_id=payload.shiftPatternId,
        staff_id=payload.staffId,
        zone_id=payload.zoneId,
        note=payload.note,
        created_by=user.id,
    )
    session.add(row)
    await history.flush(session, DOUBLE_BOOKED)
    history.record(
        session,
        entity="shift_assignment",
        entity_id=row.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={
            "workDate": [None, payload.workDate.isoformat()],
            "staffId": [None, str(payload.staffId)],
            "zoneId": [None, payload.zoneId],
        },
    )
    await history.commit(session, DOUBLE_BOOKED)
    return _assignment(row)


async def update_assignment(
    session: AsyncSession,
    user: User,
    assignment_id: UUID,
    payload: schemas.ShiftAssignmentUpdate,
) -> schemas.JanitorialShiftAssignment:
    access.require_shifts(user)
    row = await session.get(ShiftAssignment, assignment_id, with_for_update=True)
    if row is None:
        raise NotFoundError("Assignment not found")
    await access.require_zone(session, user, row.zone_id)
    history.check_revision(row, payload.expectedRevision)
    if payload.status == "scheduled":
        await _check_assignment(session, user, payload.shiftPatternId, payload.zoneId)
    changes = history.apply(
        row,
        {
            "shift_pattern_id": payload.shiftPatternId,
            "zone_id": payload.zoneId,
            "status": payload.status,
            "note": payload.note,
        },
    )
    if changes:
        row.revision += 1
        row.updated_at = func.now()
        history.record(
            session,
            entity="shift_assignment",
            entity_id=row.id,
            revision=row.revision,
            action=(
                ("cancelled" if payload.status == "cancelled" else "rescheduled")
                if "status" in changes
                else "updated"
            ),
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, DOUBLE_BOOKED)
    return _assignment(row)
