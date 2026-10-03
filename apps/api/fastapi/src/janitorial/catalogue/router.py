from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from src.auth.browser import BrowserUser
from src.janitorial.dependencies import JanitorialSession
from src.janitorial.responses import FORBIDDEN, NOT_FOUND, UNAVAILABLE, WRITE

from . import schemas, service

router = APIRouter(tags=["janitorial"])


@router.get(
    "/catalogue",
    response_model=schemas.JanitorialCatalogue,
    summary="Get the cleaning catalogue",
    description="Returns sites and, for the buildings the user may act on, sections, areas (with code, space type and APPA level), tasks and bundles. Inactive records are included so managers can restore them.",
    responses={**FORBIDDEN, **NOT_FOUND, **UNAVAILABLE},
)
async def get_catalogue(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    site: Annotated[
        str | None,
        Query(pattern="^[A-Za-z]{3}$", description="Site code, e.g. GND or CRU"),
    ] = None,
) -> Any:
    return await service.catalogue(session, user, site)


@router.post(
    "/buildings",
    response_model=schemas.JanitorialBuilding,
    status_code=status.HTTP_201_CREATED,
    summary="Add a building",
    description="Adds a building to a site. Needs catalogue management and all-building scope.",
    responses=WRITE,
)
async def create_building(
    *, user: BrowserUser, session: JanitorialSession, payload: schemas.BuildingCreate
) -> Any:
    return await service.create_building(session, user, payload)


@router.patch(
    "/buildings/{building_id}",
    response_model=schemas.JanitorialBuilding,
    summary="Update a building",
    description="Renames, re-kinds or (de)activates a building. Send the revision you last read.",
    responses=WRITE,
)
async def update_building(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    building_id: int,
    payload: schemas.BuildingUpdate,
) -> Any:
    return await service.update_building(session, user, building_id, payload)


@router.post(
    "/sections",
    response_model=schemas.JanitorialSection,
    status_code=status.HTTP_201_CREATED,
    summary="Add a section",
    description="Adds a named group of areas to a building.",
    responses=WRITE,
)
async def create_section(
    *, user: BrowserUser, session: JanitorialSession, payload: schemas.SectionCreate
) -> Any:
    return await service.create_section(session, user, payload)


@router.patch(
    "/sections/{section_id}",
    response_model=schemas.JanitorialSection,
    summary="Update a section",
    description="Renames, annotates or (de)activates a section. Send the revision you last read.",
    responses=WRITE,
)
async def update_section(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    section_id: int,
    payload: schemas.SectionUpdate,
) -> Any:
    return await service.update_section(session, user, section_id, payload)


@router.post(
    "/areas",
    response_model=schemas.JanitorialArea,
    status_code=status.HTTP_201_CREATED,
    summary="Add an area",
    description="Adds a cleanable area. The printable code is assigned automatically; an omitted space type and APPA level are inferred from the name.",
    responses=WRITE,
)
async def create_area(
    *, user: BrowserUser, session: JanitorialSession, payload: schemas.AreaCreate
) -> Any:
    return await service.create_area(session, user, payload)


@router.patch(
    "/areas/{area_id}",
    response_model=schemas.JanitorialArea,
    summary="Update an area",
    description="Updates an area's name, section, space type, APPA level, quantity or active state. Send the revision you last read.",
    responses=WRITE,
)
async def update_area(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    area_id: int,
    payload: schemas.AreaUpdate,
) -> Any:
    return await service.update_area(session, user, area_id, payload)


@router.post(
    "/areas/{area_id}/tasks",
    response_model=schemas.JanitorialTask,
    status_code=status.HTTP_201_CREATED,
    summary="Add a task to an area",
    description="Adds a cleaning activity and frequency to an area. Activity names are matched to existing activities.",
    responses=WRITE,
)
async def create_task(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    area_id: int,
    payload: schemas.TaskCreate,
) -> Any:
    return await service.create_task(session, user, area_id, payload)


@router.patch(
    "/tasks/{task_id}",
    response_model=schemas.JanitorialTask,
    summary="Update a task",
    description="Changes a task's activity, frequency, mode or active state. Send the revision you last read.",
    responses=WRITE,
)
async def update_task(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    task_id: int,
    payload: schemas.TaskUpdate,
) -> Any:
    return await service.update_task(session, user, task_id, payload)
