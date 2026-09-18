from collections.abc import AsyncGenerator
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.browser import BrowserUser

from . import database, service
from .schemas import (
    ArchiveBulletin,
    ArchiveHistory,
    ArchivePage,
    EditionAsset,
    SynopticImageGroups,
)

router = APIRouter(prefix="/wxwatch", tags=["wxwatch"])


async def get_session() -> AsyncGenerator[AsyncSession]:
    session = database.create_session()
    if session is None:
        raise HTTPException(503, "Weather image metadata is unavailable")
    try:
        async with session:
            yield session
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Weather image metadata is unavailable") from None


ImageSession = Annotated[AsyncSession, Depends(get_session)]


@router.get("/metadata", response_model=SynopticImageGroups)
async def metadata(
    day: date, _user: BrowserUser, session: ImageSession, response: Response
) -> SynopticImageGroups:
    """Authenticated gallery metadata for one UTC date, grouped into eight synoptic slots."""
    response.headers["Cache-Control"] = "private, no-store"
    return await service.load_images(session, day)


@router.get("/ready", status_code=204)
async def ready(session: ImageSession, response: Response) -> None:
    """Availability only; no image metadata or database details are exposed."""
    response.headers["Cache-Control"] = "no-store"
    await session.execute(text("SELECT id FROM weather_images LIMIT 1"))


@router.get("/archive", response_model=ArchivePage)
async def archive(
    _user: BrowserUser,
    session: ImageSession,
    response: Response,
    source: Annotated[str | None, Query(max_length=100)] = None,
    product: Annotated[str | None, Query(max_length=300)] = None,
    start: date | None = None,
    end: date | None = None,
    unknown_time: bool = False,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ArchivePage:
    if start and end and start > end:
        raise HTTPException(422, "Start date must precede end date")
    if end == date.max:
        raise HTTPException(422, "End date is out of range")
    if unknown_time and (start or end):
        raise HTTPException(422, "Unknown-time search cannot include date bounds")
    response.headers["Cache-Control"] = "private, no-store"
    return await service.browse_archive(
        session,
        source=source,
        product=product,
        start=start,
        end=end,
        unknown_time=unknown_time,
        offset=offset,
        limit=limit,
    )


@router.get("/archive/{edition_id}/retrievals", response_model=ArchiveHistory)
async def retrievals(
    edition_id: UUID,
    _user: BrowserUser,
    session: ImageSession,
    response: Response,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ArchiveHistory:
    if not await session.scalar(
        text("SELECT id FROM archive_editions WHERE id=:id"), {"id": edition_id}
    ):
        raise HTTPException(404, "Edition not found")
    response.headers["Cache-Control"] = "private, no-store"
    return await service.archive_history(session, edition_id, offset, limit)


@router.get("/archive/{edition_id}/bulletin", response_model=ArchiveBulletin)
async def bulletin(
    edition_id: UUID, _user: BrowserUser, session: ImageSession, response: Response
) -> ArchiveBulletin:
    result = await service.load_bulletin(session, edition_id)
    if result is None:
        raise HTTPException(404, "Bulletin not found")
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/archive/{edition_id}/assets", response_model=list[EditionAsset])
async def edition_assets(
    edition_id: UUID, _user: BrowserUser, session: ImageSession, response: Response
) -> list[EditionAsset]:
    if not await session.scalar(
        text("SELECT id FROM archive_editions WHERE id=:id"), {"id": edition_id}
    ):
        raise HTTPException(404, "Edition not found")
    response.headers["Cache-Control"] = "private, no-store"
    rows = (
        (
            await session.execute(
                text("""SELECT a.id::text AS asset_id, ea.role,
        a.sha256,a.byte_size,a.media_type FROM archive_edition_assets ea
        JOIN archive_assets a ON a.id=ea.asset_id WHERE ea.edition_id=:id
        ORDER BY ea.role,a.id"""),
                {"id": edition_id},
            )
        )
        .mappings()
        .all()
    )
    return [EditionAsset.model_validate(row) for row in rows]
