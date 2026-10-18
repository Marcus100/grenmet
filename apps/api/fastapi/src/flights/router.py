from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from src.rate_limit import limiter

from . import service
from .schemas import FlightBoardResponse

router = APIRouter(prefix="/flights", tags=["flights"])


@router.get(
    "/board",
    response_model=FlightBoardResponse,
    summary="Recent flight movements for an airport",
    description=(
        "Public. Returns cached OpenSky movements (research use). The provider's "
        "arrival/departure data is batch-processed, so rows are from the previous "
        "day or earlier, not live. `available` is false when the feature flag "
        "FLIGHTS_OPENSKY_ENABLED is off or nothing is cached; clients must then "
        "show their own labelled sample."
    ),
)
@limiter.limit("60/minute")
async def get_flight_board(
    *,
    request: Request,
    airport: Annotated[Literal["TGPY"], Query()] = "TGPY",
    board: Annotated[Literal["arrivals", "departures"], Query()] = "arrivals",
) -> FlightBoardResponse:
    _ = request
    return await service.get_board(airport=airport, board=board)
