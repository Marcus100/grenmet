from datetime import datetime
from typing import Literal

from pydantic import Field

from src.models import BaseModel


class FlightRow(BaseModel):
    """One recent movement. Not a schedule: `time` is when the aircraft was seen."""

    callsign: str | None = Field(default=None, max_length=16)
    icao24: str | None = Field(default=None, max_length=8)
    # ICAO code of the other end of the route, when the provider estimated one.
    other_airport_icao: str | None = Field(default=None, max_length=4)
    time: datetime
    board: Literal["arrivals", "departures"]


class FlightBoardResponse(BaseModel):
    available: bool
    airport: str
    board: Literal["arrivals", "departures"]
    source: str | None = None
    fetched_at: datetime | None = None
    # Always false: sample data is a web-side fallback, never served here.
    is_sample: bool = False
    rows: list[FlightRow] = []
