"""Cleaning catalogue v2: sites, buildings, sections, areas and their tasks.

Reads are scoped to the buildings a user may act on. Edits replace a record's
editable fields, check ``expectedRevision`` and record history; records are
deactivated, never deleted, so printed area codes and past work stay valid.
"""

import logging
import re
from collections import defaultdict

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError, AuthorizationError, NotFoundError
from src.janitorial import access, history
from src.janitorial.models import (
    Activity,
    Area,
    AreaTask,
    Building,
    Section,
    Site,
)

from . import schemas

logger = logging.getLogger(__name__)


def _slug(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def _frequency(task: AreaTask) -> schemas.JanitorialFrequency:
    return schemas.JanitorialFrequency(
        count=task.freq_count,
        periodValue=task.freq_period_value,
        periodUnit=task.freq_period_unit,  # type: ignore[arg-type]
    )


async def _bundles(
    session: AsyncSession, area_ids: list[int]
) -> dict[int, list[schemas.JanitorialBundle]]:
    if not area_ids:
        return {}
    rows = await session.execute(
        text("""
            SELECT abr.area_id, tb.id AS bundle_id, tb.name AS bundle_name,
                   a.name AS activity, i.freq_count, i.freq_period_value,
                   i.freq_period_unit::text AS unit
            FROM area_bundle_refs abr
            JOIN task_bundles tb ON tb.id = abr.bundle_id
            JOIN task_bundle_items i ON i.bundle_id = tb.id AND i.active
            JOIN activities a ON a.id = i.activity_id
            WHERE abr.area_id = ANY(:area_ids)
            ORDER BY abr.area_id, abr.sort_order, i.sort_order
        """),
        {"area_ids": area_ids},
    )
    result: dict[int, list[schemas.JanitorialBundle]] = defaultdict(list)
    for row in rows.mappings():
        bundles = result[row["area_id"]]
        if not bundles or bundles[-1].id != row["bundle_id"]:
            bundles.append(
                schemas.JanitorialBundle(
                    id=row["bundle_id"], name=row["bundle_name"], items=[]
                )
            )
        bundles[-1].items.append(
            schemas.JanitorialBundleItem(
                activity=row["activity"],
                frequency=schemas.JanitorialFrequency(
                    count=row["freq_count"],
                    periodValue=row["freq_period_value"],
                    periodUnit=row["unit"],
                ),
            )
        )
    return result


async def _tasks(
    session: AsyncSession, area_ids: list[int]
) -> dict[int, list[schemas.JanitorialTask]]:
    rows = await session.execute(
        select(AreaTask, Activity.name)
        .join(Activity, Activity.id == AreaTask.activity_id)
        .where(AreaTask.area_id.in_(area_ids))
        .order_by(AreaTask.area_id, AreaTask.sort_order, AreaTask.id)
    )
    result: dict[int, list[schemas.JanitorialTask]] = defaultdict(list)
    for task, activity in rows:
        result[task.area_id].append(_task(task, activity))
    return result


def _task(task: AreaTask, activity: str) -> schemas.JanitorialTask:
    return schemas.JanitorialTask(
        id=task.id,
        activity=activity,
        frequency=_frequency(task),
        mode=task.mode,
        active=task.active,
        revision=task.revision,
    )


def _section(section: Section) -> schemas.JanitorialSection:
    return schemas.JanitorialSection(
        id=section.id,
        name=section.name,
        note=section.note,
        active=section.active,
        revision=section.revision,
    )


def _area(
    area: Area,
    tasks: list[schemas.JanitorialTask],
    bundles: list[schemas.JanitorialBundle],
) -> schemas.JanitorialArea:
    return schemas.JanitorialArea(
        id=area.id,
        code=area.code,
        name=area.name,
        sectionId=area.section_id,
        spaceType=area.space_type,  # type: ignore[arg-type]
        cleanlinessLevel=area.cleanliness_level,
        quantity=area.quantity,
        active=area.active,
        revision=area.revision,
        tasks=tasks,
        bundles=bundles,
    )


async def catalogue(
    session: AsyncSession, user: User, site: str | None
) -> schemas.JanitorialCatalogue:
    access.require_view(user)
    scope = await access.building_scope(session, user)
    sites = list(
        await session.scalars(
            select(Site).where(Site.active).order_by(Site.sort_order, Site.id)
        )
    )
    query = select(Building).order_by(Building.sort_order, Building.id)
    if site:
        site_ids = [value.id for value in sites if value.code == site.upper()]
        if not site_ids:
            raise NotFoundError("Site not found")
        query = query.where(Building.site_id == site_ids[0])
    if scope is not None:
        query = query.where(Building.id.in_(scope))
    buildings = list(await session.scalars(query))
    building_ids = [building.id for building in buildings]

    sections: dict[int, list[Section]] = defaultdict(list)
    for section in await session.scalars(
        select(Section)
        .where(Section.building_id.in_(building_ids))
        .order_by(Section.sort_order, Section.id)
    ):
        sections[section.building_id].append(section)
    areas: dict[int, list[Area]] = defaultdict(list)
    for area in await session.scalars(
        select(Area)
        .where(Area.building_id.in_(building_ids))
        .order_by(Area.sort_order, Area.id)
    ):
        areas[area.building_id].append(area)
    area_ids = [area.id for group in areas.values() for area in group]
    tasks = await _tasks(session, area_ids)
    bundles = await _bundles(session, area_ids)

    return schemas.JanitorialCatalogue(
        sites=[
            schemas.JanitorialSite(id=value.id, code=value.code, name=value.name)
            for value in sites
        ],
        buildings=[
            schemas.JanitorialBuilding(
                id=building.id,
                siteId=building.site_id,
                code=building.code,
                name=building.name,
                kind=building.kind,  # type: ignore[arg-type]
                active=building.active,
                revision=building.revision,
                sections=[_section(section) for section in sections[building.id]],
                areas=[
                    _area(area, tasks.get(area.id, []), bundles.get(area.id, []))
                    for area in areas[building.id]
                ],
            )
            for building in buildings
        ],
    )


# --- Buildings -------------------------------------------------------------


def _building(building: Building) -> schemas.JanitorialBuilding:
    return schemas.JanitorialBuilding(
        id=building.id,
        siteId=building.site_id,
        code=building.code,
        name=building.name,
        kind=building.kind,  # type: ignore[arg-type]
        active=building.active,
        revision=building.revision,
        sections=[],
        areas=[],
    )


async def create_building(
    session: AsyncSession, user: User, payload: schemas.BuildingCreate
) -> schemas.JanitorialBuilding:
    access.require_catalogue(user)
    # A new building has no grants yet, so only scope administrators add one.
    if not access.all_buildings(user):
        raise AuthorizationError("Only janitorial scope administrators add buildings")
    site = await session.get(Site, payload.siteId)
    if site is None or not site.active:
        raise NotFoundError("Site not found")
    sort_order = await session.scalar(
        select(func.coalesce(func.max(Building.sort_order), -1))
    )
    building = Building(
        site_id=site.id,
        name=payload.name,
        code=f"{site.code.lower()}-{_slug(payload.name)}",
        kind=payload.kind,
        sort_order=(sort_order or 0) + 1,
    )
    session.add(building)
    await history.flush(session, "That record already exists")
    history.record(
        session,
        entity="building",
        entity_id=building.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, payload.name], "siteId": [None, site.id]},
    )
    await history.commit(session, f"A building named {payload.name} already exists")
    logger.info("Janitorial building created", extra={"building_id": building.id})
    return _building(building)


async def update_building(
    session: AsyncSession,
    user: User,
    building_id: int,
    payload: schemas.BuildingUpdate,
) -> schemas.JanitorialBuilding:
    access.require_catalogue(user)
    building = await session.get(Building, building_id, with_for_update=True)
    if building is None:
        raise NotFoundError("Building not found")
    await access.require_building(session, user, building_id)
    history.check_revision(building, payload.expectedRevision)
    changes = history.apply(
        building,
        {"name": payload.name, "kind": payload.kind, "active": payload.active},
    )
    if changes:
        building.revision += 1
        history.record(
            session,
            entity="building",
            entity_id=building.id,
            revision=building.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, "Building could not be saved")
    return _building(building)


# --- Sections --------------------------------------------------------------


async def create_section(
    session: AsyncSession, user: User, payload: schemas.SectionCreate
) -> schemas.JanitorialSection:
    access.require_catalogue(user)
    if await session.get(Building, payload.buildingId) is None:
        raise NotFoundError("Building not found")
    await access.require_building(session, user, payload.buildingId)
    sort_order = await session.scalar(
        select(func.coalesce(func.max(Section.sort_order), -1)).where(
            Section.building_id == payload.buildingId
        )
    )
    section = Section(
        building_id=payload.buildingId,
        name=payload.name,
        note=payload.note,
        sort_order=(sort_order or 0) + 1,
    )
    session.add(section)
    await history.flush(session, "That record already exists")
    history.record(
        session,
        entity="section",
        entity_id=section.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, payload.name]},
    )
    await history.commit(session, "Section could not be saved")
    return _section(section)


async def update_section(
    session: AsyncSession,
    user: User,
    section_id: int,
    payload: schemas.SectionUpdate,
) -> schemas.JanitorialSection:
    access.require_catalogue(user)
    section = await session.get(Section, section_id, with_for_update=True)
    if section is None:
        raise NotFoundError("Section not found")
    await access.require_building(session, user, section.building_id)
    history.check_revision(section, payload.expectedRevision)
    changes = history.apply(
        section,
        {"name": payload.name, "note": payload.note, "active": payload.active},
    )
    if changes:
        section.revision += 1
        history.record(
            session,
            entity="section",
            entity_id=section.id,
            revision=section.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, "Section could not be saved")
    return _section(section)


# --- Areas -----------------------------------------------------------------


async def _check_section(
    session: AsyncSession, building_id: int, section_id: int | None
) -> None:
    if section_id is None:
        return
    section = await session.get(Section, section_id)
    if section is None or section.building_id != building_id:
        raise AppValidationError("The section must belong to the area's building")


async def _area_view(session: AsyncSession, area: Area) -> schemas.JanitorialArea:
    tasks = await _tasks(session, [area.id])
    bundles = await _bundles(session, [area.id])
    return _area(area, tasks.get(area.id, []), bundles.get(area.id, []))


async def create_area(
    session: AsyncSession, user: User, payload: schemas.AreaCreate
) -> schemas.JanitorialArea:
    access.require_catalogue(user)
    if await session.get(Building, payload.buildingId) is None:
        raise NotFoundError("Building not found")
    await access.require_building(session, user, payload.buildingId)
    await _check_section(session, payload.buildingId, payload.sectionId)
    sort_order = await session.scalar(
        select(func.coalesce(func.max(Area.sort_order), -1)).where(
            Area.building_id == payload.buildingId
        )
    )
    area = Area(
        building_id=payload.buildingId,
        section_id=payload.sectionId,
        name=payload.name,
        quantity=payload.quantity,
        sort_order=(sort_order or 0) + 1,
    )
    # Omitted type and level are inferred by the ``areas_defaults`` trigger.
    if payload.spaceType is not None:
        area.space_type = payload.spaceType
        area.cleanliness_level = payload.cleanlinessLevel
    session.add(area)
    await history.flush(session, "That record already exists")
    await session.refresh(area)
    history.record(
        session,
        entity="area",
        entity_id=area.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, area.name], "code": [None, area.code]},
    )
    await history.commit(session, "Area could not be saved")
    logger.info("Janitorial area created", extra={"area_id": area.id})
    return await _area_view(session, area)


async def update_area(
    session: AsyncSession, user: User, area_id: int, payload: schemas.AreaUpdate
) -> schemas.JanitorialArea:
    access.require_catalogue(user)
    area = await session.get(Area, area_id, with_for_update=True)
    if area is None:
        raise NotFoundError("Area not found")
    await access.require_building(session, user, area.building_id)
    history.check_revision(area, payload.expectedRevision)
    await _check_section(session, area.building_id, payload.sectionId)
    changes = history.apply(
        area,
        {
            "section_id": payload.sectionId,
            "name": payload.name,
            "space_type": payload.spaceType,
            "cleanliness_level": payload.cleanlinessLevel,
            "quantity": payload.quantity,
            "active": payload.active,
        },
    )
    if changes:
        area.revision += 1
        history.record(
            session,
            entity="area",
            entity_id=area.id,
            revision=area.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, "Area could not be saved")
    return await _area_view(session, area)


# --- Tasks -----------------------------------------------------------------


async def _activity(session: AsyncSession, name: str) -> Activity:
    """Reuse the activity with the same slug; never duplicate free text."""
    slug = _slug(name)
    if not slug:
        raise AppValidationError("Activity name needs letters or numbers")
    activity = await session.scalar(select(Activity).where(Activity.slug == slug))
    if activity is None:
        activity = Activity(slug=slug, name=name.strip())
        session.add(activity)
        await history.flush(session, "That record already exists")
    return activity


async def create_task(
    session: AsyncSession, user: User, area_id: int, payload: schemas.TaskCreate
) -> schemas.JanitorialTask:
    access.require_catalogue(user)
    area = await session.get(Area, area_id)
    if area is None:
        raise NotFoundError("Area not found")
    await access.require_building(session, user, area.building_id)
    activity = await _activity(session, payload.activity)
    sort_order = await session.scalar(
        select(func.coalesce(func.max(AreaTask.sort_order), -1)).where(
            AreaTask.area_id == area_id
        )
    )
    task = AreaTask(
        area_id=area_id,
        activity_id=activity.id,
        freq_count=payload.frequency.count,
        freq_period_value=payload.frequency.periodValue,
        freq_period_unit=payload.frequency.periodUnit,
        mode=payload.mode,
        sort_order=(sort_order or 0) + 1,
    )
    session.add(task)
    await history.flush(session, "That record already exists")
    history.record(
        session,
        entity="area_task",
        entity_id=task.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"activity": [None, activity.name], "areaId": [None, area_id]},
    )
    await history.commit(session, "Task could not be saved")
    return _task(task, activity.name)


async def update_task(
    session: AsyncSession, user: User, task_id: int, payload: schemas.TaskUpdate
) -> schemas.JanitorialTask:
    access.require_catalogue(user)
    task = await session.get(AreaTask, task_id, with_for_update=True)
    if task is None:
        raise NotFoundError("Task not found")
    building_id = await session.scalar(
        select(Area.building_id).where(Area.id == task.area_id)
    )
    await access.require_building(session, user, building_id or 0)
    history.check_revision(task, payload.expectedRevision)
    activity = await _activity(session, payload.activity)
    changes = history.apply(
        task,
        {
            "activity_id": activity.id,
            "freq_count": payload.frequency.count,
            "freq_period_value": payload.frequency.periodValue,
            "freq_period_unit": payload.frequency.periodUnit,
            "mode": payload.mode,
            "active": payload.active,
        },
    )
    if changes:
        task.revision += 1
        history.record(
            session,
            entity="area_task",
            entity_id=task.id,
            revision=task.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, "Task could not be saved")
    return _task(task, activity.name)
