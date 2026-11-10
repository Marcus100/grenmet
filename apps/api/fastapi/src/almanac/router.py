"""Public almanac routes (ADR-0025 zone ``public``). Logic lives in ``service``."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, Response

from src.dependencies import SessionDep
from src.rate_limit import limiter

from . import service
from .schemas import AstronomyResponse, TidesResponse

router = APIRouter(prefix="/almanac", tags=["almanac"])

#: Predictions are fixed for the day: let caches hold them for a day.
CACHE_ALMANAC = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
LocationKey = Literal["mbia", "lauriston"]
StationKey = Literal["pric"]


@router.get(
    "/public/astronomy",
    response_model=AstronomyResponse,
    summary="Sun, twilight and moon times for a Grenada location",
    description=(
        "Public. Sunrise, sunset, civil dawn and dusk, moonrise and moonset in UTC with "
        "Grenada local times, and the moon phase name for each day, from the yearly "
        "almanac table. Also returns the principal phases (new, first quarter, full, "
        "last quarter) inside the range plus the nearest one either side. Maximum range "
        "366 days. Days with no stored row are missing from `days`."
    ),
)
@limiter.limit("60/minute")
async def get_astronomy(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    location: Annotated[LocationKey, Query(description="Location key")],
    start: Annotated[date, Query(alias="from", description="First local date")],
    end: Annotated[date, Query(alias="to", description="Last local date (inclusive)")],
) -> AstronomyResponse:
    _ = request
    result = await service.get_astronomy(session, location, start, end)
    response.headers["Cache-Control"] = CACHE_ALMANAC
    return result


@router.get(
    "/public/tides",
    response_model=TidesResponse,
    summary="Predicted high and low tides for a Grenada station",
    description=(
        "Public. Predicted high and low water times (UTC with Grenada local times) and "
        "heights in metres relative to provisional MLLW. PREDICTED, PROVISIONAL AND NOT "
        "FOR NAVIGATION: every response carries that note. Maximum range 366 days."
    ),
)
@limiter.limit("60/minute")
async def get_tides(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    station: Annotated[StationKey, Query(description="Station key")],
    start: Annotated[date, Query(alias="from", description="First local date")],
    end: Annotated[date, Query(alias="to", description="Last local date (inclusive)")],
) -> TidesResponse:
    _ = request
    result = await service.get_tides(session, station, start, end)
    response.headers["Cache-Control"] = CACHE_ALMANAC
    return result
