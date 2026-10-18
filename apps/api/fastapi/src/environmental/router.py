from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from src.dependencies import SessionDep
from src.rate_limit import limiter

from . import service
from .points import PointId, get_point
from .schemas import AirResponse, MarineResponse

router = APIRouter(prefix="/environment", tags=["environment"])

# Forecasts refresh a few times a day: let Cloudflare hold them for 30 minutes
# and serve stale while it revalidates. Unavailable answers stay short-lived so
# a freshly configured fetch shows up quickly.
CACHE_AVAILABLE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600"
CACHE_UNAVAILABLE = "public, max-age=60, s-maxage=120"


@router.get(
    "/marine",
    response_model=MarineResponse,
    summary="Marine forecast for a Grenada coastal point",
    description=(
        "Public. Significant wave height, primary swell height/period/direction "
        "and sea surface temperature from the Copernicus Marine global analysis "
        "and forecast. External data, not a GMS product. `available` is false "
        "when Copernicus credentials are unset or nothing has been fetched; "
        "clients must show an unavailable state, never sample data."
    ),
)
@limiter.limit("60/minute")
async def get_marine(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    point: Annotated[PointId, Query()] = "st-georges",
) -> MarineResponse:
    _ = request
    result = await service.get_marine(session, get_point(point))
    response.headers["Cache-Control"] = (
        CACHE_AVAILABLE if result.available else CACHE_UNAVAILABLE
    )
    return result


@router.get(
    "/air",
    response_model=AirResponse,
    summary="UV index and Saharan dust forecast for a Grenada point",
    description=(
        "Public. UV index (step-mean) and dust aerosol optical depth at 550 nm "
        "from the Copernicus Atmosphere Monitoring Service global forecast. "
        "External data, not a GMS product. `available` is false when CAMS "
        "credentials are unset or nothing has been fetched."
    ),
)
@limiter.limit("60/minute")
async def get_air(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    point: Annotated[PointId, Query()] = "st-georges",
) -> AirResponse:
    _ = request
    result = await service.get_air(session, get_point(point))
    response.headers["Cache-Control"] = (
        CACHE_AVAILABLE if result.available else CACHE_UNAVAILABLE
    )
    return result
