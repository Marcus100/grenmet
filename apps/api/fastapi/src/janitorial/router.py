from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from src.auth.browser import BrowserUser
from src.models import ApiError

from . import access
from .catalogue.router import router as catalogue_router
from .dependencies import JanitorialSession, get_session
from .people.router import router as people_router
from .schemas import (
    AreaView,
    BuildingView,
    BundleItem,
    BundleView,
    Frequency,
    JanitorialAccess,
    SectionView,
    TaskView,
)
from .shifts.router import router as shifts_router

__all__ = ["get_session", "router"]

router = APIRouter(prefix="/janitorial", tags=["janitorial"])
router.include_router(catalogue_router)
router.include_router(people_router)
router.include_router(shifts_router)

Session = JanitorialSession


@router.get(
    "/access",
    response_model=JanitorialAccess,
    summary="Get my janitorial permissions",
    description="Returns which janitorial portal actions the signed-in user may take and the buildings they may act on, so clients can show or hide controls. The API still enforces every rule.",
    responses={401: {"model": ApiError}},
)
async def get_access(*, user: BrowserUser, session: JanitorialSession) -> Any:
    return await access.access(session, user)


@router.get(
    "/spec",
    response_model=list[BuildingView],
    summary="Get the janitorial catalogue",
    description="Returns the building, section, area, and task hierarchy used by the janitorial workflow.",
)
async def spec(_user: BrowserUser, session: Session) -> list[BuildingView]:
    result = await session.execute(
        text("""
        SELECT b.id AS building_id, b.name AS building_name, b.sort_order AS building_order,
               s.id AS section_id, s.name AS section_name, s.sort_order AS section_order,
               a.id AS area_id, a.name AS area_name, a.sort_order AS area_order,
               t.id AS task_id, t.mode, t.freq_count, t.freq_period_value, t.freq_period_unit,
               act.name AS activity_name, t.sort_order AS task_order
        FROM buildings b
        LEFT JOIN (
            SELECT id, building_id, name, sort_order FROM sections WHERE active
            UNION ALL
            -- Areas without a section form their own group, even in buildings
            -- that also have sections.
            SELECT DISTINCT NULL::integer, building_id, NULL::text, NULL::integer
            FROM areas WHERE section_id IS NULL AND active
        ) s ON s.building_id=b.id
        LEFT JOIN areas a ON a.building_id=b.id AND a.section_id IS NOT DISTINCT FROM s.id
            AND a.active
        LEFT JOIN area_tasks t ON t.area_id=a.id AND t.active
        LEFT JOIN activities act ON act.id=t.activity_id
        -- Inactive records (e.g. the retired Auxiliary Buildings placeholder) stay out.
        WHERE b.active
        ORDER BY b.sort_order, s.sort_order NULLS FIRST, a.sort_order, t.sort_order
    """)
    )
    rows = result.mappings().all()
    bundle_result = await session.execute(
        text("""
        SELECT abr.area_id, tb.id AS bundle_id, tb.name AS bundle_name,
               a.name AS activity_name, i.freq_count, i.freq_period_value, i.freq_period_unit,
               abr.sort_order AS ref_order, i.sort_order AS item_order
        FROM area_bundle_refs abr
        JOIN task_bundles tb ON tb.id=abr.bundle_id
        JOIN task_bundle_items i ON i.bundle_id=tb.id AND i.active
        JOIN activities a ON a.id=i.activity_id
        ORDER BY abr.area_id, abr.sort_order, i.sort_order
    """)
    )
    bundle_rows = bundle_result.mappings().all()
    bundles: dict[int, list[BundleView]] = {}
    for row in bundle_rows:
        area_id = int(row["area_id"])
        existing = next(
            (b for b in bundles.setdefault(area_id, []) if b.id == row["bundle_id"]),
            None,
        )
        if existing is None:
            existing = BundleView(
                id=row["bundle_id"], name=row["bundle_name"], items=[]
            )
            bundles[area_id].append(existing)
        existing.items.append(
            BundleItem(
                activity=row["activity_name"],
                frequency=Frequency(
                    count=row["freq_count"],
                    periodValue=row["freq_period_value"],
                    periodUnit=row["freq_period_unit"],
                ),
            )
        )
    buildings: list[BuildingView] = []
    by_building: dict[int, BuildingView] = {}
    by_group: dict[tuple[int, int | None], SectionView] = {}
    by_area: dict[int, AreaView] = {}
    for row in rows:
        bid = int(row["building_id"])
        building = by_building.get(bid)
        if building is None:
            building = BuildingView(id=bid, name=row["building_name"], sections=[])
            by_building[bid] = building
            buildings.append(building)
        sid = row["section_id"]
        group = by_group.get((bid, sid))
        if group is None:
            group = SectionView(id=sid, name=row["section_name"], areas=[])
            by_group[(bid, sid)] = group
            building.sections.append(group)
        aid = row["area_id"]
        if aid is None:
            continue
        area = by_area.get(int(aid))
        if area is None:
            area = AreaView(
                id=aid, name=row["area_name"], tasks=[], bundles=bundles.get(aid, [])
            )
            by_area[int(aid)] = area
            group.areas.append(area)
        if row["task_id"] is not None:
            area.tasks.append(
                TaskView(
                    id=row["task_id"],
                    activity=row["activity_name"],
                    mode=row["mode"],
                    frequency=Frequency(
                        count=row["freq_count"],
                        periodValue=row["freq_period_value"],
                        periodUnit=row["freq_period_unit"],
                    ),
                )
            )
    return buildings
