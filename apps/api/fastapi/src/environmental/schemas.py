from typing import Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime


class Provenance(BaseModel):
    """Where a value came from. Always external: these are not GMS products."""

    source: str
    issued_at: UtcDateTime | None = None
    fetched_at: UtcDateTime | None = None
    status: Literal["external"] = "external"


class MarineRow(BaseModel):
    time: UtcDateTime
    wave_height_m: float | None = Field(
        default=None, description="Significant wave height (VHM0)"
    )
    swell_height_m: float | None = Field(
        default=None, description="Primary swell height"
    )
    swell_period_s: float | None = Field(
        default=None, description="Primary swell mean period"
    )
    swell_direction_deg: float | None = Field(
        default=None, description="Primary swell mean direction (coming from), degrees"
    )
    sea_surface_temp_c: float | None = None


class AirRow(BaseModel):
    time: UtcDateTime
    uv_index: float | None = Field(
        default=None,
        description=(
            "UV index averaged over the preceding 3-hour forecast step; the "
            "midday peak is higher"
        ),
    )
    dust_aod_550: float | None = Field(
        default=None, description="Dust aerosol optical depth at 550 nm (unitless)"
    )


class _EnvironmentResponse(BaseModel):
    # False when credentials are unset or nothing has been fetched yet; clients
    # must then show an unavailable state, never sample data.
    available: bool
    point: str
    point_name: str
    lat: float
    lon: float
    provenance: Provenance | None = None
    attribution: str
    # Always false: external data labelled "not a GMS product".
    is_gms_product: Literal[False] = False
    # True when older than the forecast freshness limit (12 h by default).
    stale: bool = False


class MarineResponse(_EnvironmentResponse):
    latest: MarineRow | None = None
    series: list[MarineRow] = []


class AirResponse(_EnvironmentResponse):
    latest: AirRow | None = None
    series: list[AirRow] = []
