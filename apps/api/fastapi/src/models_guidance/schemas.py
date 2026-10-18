import uuid
from enum import Enum

from pydantic import Field

from src.models import BaseModel, UtcDateTime


class GuidanceModel(str, Enum):
    IFS = "ifs"
    AIFS = "aifs"
    GFS = "gfs"


class GuidanceDecision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class GuidancePointPublic(BaseModel):
    key: str
    name: str
    latitude: float
    longitude: float


class GuidanceModelPublic(BaseModel):
    key: GuidanceModel
    label: str
    latest_run_time: UtcDateTime | None = Field(
        default=None, description="Newest stored model cycle, or null if none yet."
    )


class GuidanceCatalogue(BaseModel):
    enabled: bool = Field(description="False while the worker fetch is switched off.")
    points: list[GuidancePointPublic]
    models: list[GuidanceModelPublic]
    disclaimer: str


class MeteogramSeries(BaseModel):
    """Parallel arrays aligned with ``valid_times``; null where the model has no value."""

    valid_times: list[UtcDateTime]
    temperature_c: list[float | None]
    wind_speed_ms: list[float | None]
    wind_direction_deg: list[float | None]
    wind_gust_ms: list[float | None]
    precipitation_mm: list[float | None] = Field(
        description="Precipitation accumulated over the interval ending at each time."
    )
    mslp_hpa: list[float | None]
    cloud_cover_pct: list[float | None]


class MeteogramUnits(BaseModel):
    temperature_c: str
    wind_speed_ms: str
    wind_direction_deg: str
    wind_gust_ms: str
    precipitation_mm: str
    mslp_hpa: str
    cloud_cover_pct: str


class MeteogramPublic(BaseModel):
    point: GuidancePointPublic
    model: GuidanceModel
    label: str
    run_time: UtcDateTime
    series: MeteogramSeries
    units: MeteogramUnits
    attribution: str
    disclaimer: str


class AccessRequestCreate(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class AccessRequestDecide(BaseModel):
    decision: GuidanceDecision
    note: str | None = Field(default=None, max_length=500)


class AccessRequestPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    organisation_name: str
    status: str
    note: str | None
    decision_note: str | None
    created_at: UtcDateTime
    decided_at: UtcDateTime | None


class AccessStatusPublic(BaseModel):
    entitled: bool = Field(description="Whether the organisation holds gmsdash.")
    request: AccessRequestPublic | None = Field(
        description="The organisation's most recent request, if any."
    )


class GuidanceOrganisationPublic(BaseModel):
    """An organisation the caller belongs to, with its GMS Dashboard standing."""

    id: str
    name: str
    role: str
    entitled: bool
    request_status: str | None = Field(
        description="Status of the organisation's latest access request, if any."
    )
