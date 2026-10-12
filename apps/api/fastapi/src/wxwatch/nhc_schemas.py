"""Typed source facts and reviewed guidance shared by archive and authoring."""

from typing import Annotated, Literal, Self
from uuid import UUID, uuid4

from pydantic import ConfigDict, Field, JsonValue, model_validator

from src.models import BaseModel, UtcDateTime

NhcFamily = Literal[
    "tropical_development", "active_cyclones", "marine", "aviation_recon"
]
NhcKind = Literal[
    "outlook",
    "bulletin",
    "text",
    "image",
    "vector",
    "grid",
    "storms",
    "hdob",
    "vortex",
    "dropsonde",
]
FactKey = Literal[
    "latitude",
    "longitude",
    "axis_longitude",
    "axis_northern_limit",
    "relative_location",
    "pressure",
    "movement_direction",
    "movement_speed",
    "maximum_wind",
    "gust",
    "convection_coverage",
    "convection_intensity",
    "convection_location",
    "organization",
    "latitude_min",
    "latitude_max",
    "longitude_west",
    "longitude_east",
    "environment",
    "limiting_factor",
    "development_window",
    "formation_probability",
    "hazard",
    "affected_area",
    "duration",
    "rainfall",
    "flooding",
    "wind_direction",
    "wind_speed",
    "wave_height",
    "swell_height",
    "swell_direction",
    "swell_period",
    "visibility",
]


class GuidanceGridSample(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: UUID
    record_index: int = Field(ge=0)
    requested_latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    requested_longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    cell_latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    cell_longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    distance_km: float = Field(ge=0, allow_inf_nan=False)
    source_value: float = Field(allow_inf_nan=False)
    parameter: str
    units: str
    data_date: str
    data_time: str
    validity_date: str
    validity_time: str
    step_range: str


class GuidanceFact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID = Field(default_factory=uuid4)
    key: FactKey
    record_type: Literal["observation", "analysis", "forecast"]
    value: Annotated[float, Field(allow_inf_nan=False)] | None = None
    minimum: Annotated[float, Field(allow_inf_nan=False)] | None = None
    maximum: Annotated[float, Field(allow_inf_nan=False)] | None = None
    unit: Annotated[str, Field(max_length=40)] | None = None
    description: Annotated[str, Field(max_length=2000)] = ""
    qualifier: Annotated[str, Field(max_length=200)] | None = None
    horizon_hours: Annotated[int, Field(gt=0, le=240)] | None = None
    source_edition_id: UUID | None = None
    source_text: Annotated[str, Field(max_length=12000)] = ""
    sample: GuidanceGridSample | None = None
    reference_time: UtcDateTime | None = None
    valid_from: UtcDateTime | None = None
    valid_to: UtcDateTime | None = None

    @model_validator(mode="after")
    def check_quantity(self) -> Self:
        if self.sample is not None and self.source_edition_id is None:
            raise ValueError("Grid sample evidence requires a source edition")
        if (
            self.minimum is not None
            and self.maximum is not None
            and self.minimum > self.maximum
        ):
            raise ValueError("Minimum must not exceed maximum")
        limits = {
            "latitude": (-90, 90),
            "latitude_min": (-90, 90),
            "latitude_max": (-90, 90),
            "axis_northern_limit": (-90, 90),
            "longitude": (-180, 180),
            "axis_longitude": (-180, 180),
            "longitude_west": (-180, 180),
            "longitude_east": (-180, 180),
            "formation_probability": (0, 100),
        }
        if self.key in limits:
            low, high = limits[self.key]
            if any(
                number is not None and not low <= number <= high
                for number in (self.value, self.minimum, self.maximum)
            ):
                raise ValueError(f"{self.key} is out of range")
        if self.key == "formation_probability" and (
            self.unit != "percent" or self.horizon_hours not in {48, 168}
        ):
            raise ValueError(
                "Formation probability requires percent and a 48/168-hour horizon"
            )
        if self.valid_from and self.valid_to and self.valid_from >= self.valid_to:
            raise ValueError("Fact validity must end after it starts")
        return self


class GuidanceSource(BaseModel):
    edition_id: UUID
    product_key: str
    title: str
    issued_at: UtcDateTime | None = None
    sha256: str
    url: str | None = None


class GuidanceSystem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    source_feature_key: str | None = None
    name: Annotated[str, Field(max_length=300)]
    feature_type: Literal[
        "disturbance",
        "tropical_wave",
        "low_pressure_area",
        "low_pressure_centre",
        "tropical_cyclone",
        "other",
    ]
    parent_system_id: UUID | None = None
    suggested_parent_system_id: UUID | None = None
    relationship_confirmed: bool = False
    narrative: Annotated[str, Field(max_length=12000)] = ""
    local_assessment: Annotated[str, Field(max_length=12000)] = ""
    facts: list[GuidanceFact] = Field(default_factory=list, max_length=100)


class GuidanceGraphic(BaseModel):
    edition_id: UUID
    asset_id: UUID
    caption: Annotated[str, Field(max_length=1000)]


class ProductGuidance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sources: list[GuidanceSource] = Field(default_factory=list, max_length=30)
    systems: list[GuidanceSystem] = Field(default_factory=list, max_length=30)
    facts: list[GuidanceFact] = Field(default_factory=list, max_length=100)
    graphics: list[GuidanceGraphic] = Field(default_factory=list, max_length=10)
    local_assessment: Annotated[str, Field(max_length=12000)] = ""

    @model_validator(mode="after")
    def check_relationships(self) -> Self:
        parents = {system.id: system.parent_system_id for system in self.systems}
        if len(parents) != len(self.systems):
            raise ValueError("System IDs must be unique")
        sources = {source.edition_id for source in self.sources}
        if len(sources) != len(self.sources):
            raise ValueError("Source editions must be unique")
        for fact in self.facts + [
            fact for system in self.systems for fact in system.facts
        ]:
            if fact.source_edition_id and fact.source_edition_id not in sources:
                raise ValueError(
                    "Fact evidence must reference a selected source edition"
                )
        for graphic in self.graphics:
            if graphic.edition_id not in sources:
                raise ValueError("Graphic must reference a selected source edition")
        for system in self.systems:
            if system.parent_system_id and not system.relationship_confirmed:
                raise ValueError("Embedded feature relationships require confirmation")
            seen = {system.id}
            parent = system.parent_system_id
            while parent:
                if parent not in parents or parent in seen:
                    raise ValueError("Invalid or cyclic system relationship")
                seen.add(parent)
                parent = parents[parent]
        return self


class NhcPullRequest(BaseModel):
    families: list[NhcFamily] = Field(min_length=1, max_length=4)


class NhcPointRequest(BaseModel):
    edition_id: UUID
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class NhcJob(BaseModel):
    id: UUID
    kind: Literal["pull", "point"]
    status: Literal["queued", "running", "success", "partial", "failed"]
    created_at: UtcDateTime
    started_at: UtcDateTime | None = None
    finished_at: UtcDateTime | None = None
    result: dict[str, JsonValue] | None = None
    error: str | None = None


class NhcEdition(BaseModel):
    id: UUID
    product_key: str
    title: str
    family: NhcFamily
    kind: NhcKind
    storm_id: str | None = None
    issued_at: UtcDateTime | None = None
    header_issued_at: UtcDateTime | None = None
    observed_at: UtcDateTime | None = None
    reference_time: UtcDateTime | None = None
    valid_start: UtcDateTime | None = None
    valid_end: UtcDateTime | None = None
    first_received_at: UtcDateTime
    last_checked_at: UtcDateTime | None = None
    last_attempted_at: UtcDateTime | None = None
    status: str
    active: bool
    stale: bool | None = None
    sha256: str
    source_url: str | None = None
    assets: list[NhcAsset] = Field(default_factory=list)


class NhcAsset(BaseModel):
    asset_id: UUID
    role: str
    media_type: str
    byte_size: int


class NhcPage(BaseModel):
    items: list[NhcEdition]
    has_more: bool
    offset: int


class NhcContent(BaseModel):
    edition: NhcEdition
    text: str | None = None
    decoded: dict[str, JsonValue]


class NhcPrefillRequest(BaseModel):
    kind: Literal["outlook", "cyclone", "marine"]
    edition_ids: list[UUID] = Field(min_length=1, max_length=30)
    point_job_ids: list[UUID] = Field(default_factory=list, max_length=20)
    zone_id: str | None = Field(default=None, max_length=20)
    period_label: str | None = Field(default=None, max_length=100)


class NhcPrefill(BaseModel):
    guidance: ProductGuidance
    values: dict[str, str]
    notices: list[str]


class NhcSourceCheck(BaseModel):
    edition_id: UUID
    newer_edition_id: UUID | None = None
    status: str
