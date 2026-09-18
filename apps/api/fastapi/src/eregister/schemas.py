from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import Field

from src.models import BaseModel, UtcDateTime

ObservationKind = Literal["SYNOP", "METAR", "SPECI"]
RegisterState = Literal["draft", "qc_pending", "accepted", "rejected", "superseded"]


class SynopWorkbook(BaseModel):
    """Structured FM-12 workbook values before TAC/BUFR encoding."""

    report_type: str | None = Field(default=None, max_length=8)
    day: str | None = Field(default=None, max_length=2)
    time_utc: str | None = Field(default=None, max_length=2)
    station_id: str | None = Field(default=None, max_length=5)
    wind_indicator: str | None = Field(default=None, max_length=2)
    precip_indicator: str | None = Field(default=None, max_length=2)
    station_wx_indicator: str | None = Field(default=None, max_length=2)
    cloud_base: str | None = Field(default=None, max_length=2)
    visibility: str | None = Field(default=None, max_length=2)
    total_cloud: str | None = Field(default=None, max_length=2)
    wind_dir: str | None = Field(default=None, max_length=3)
    wind_speed: str | None = Field(default=None, max_length=3)
    air_temp: str | None = Field(default=None, max_length=8)
    dew_point: str | None = Field(default=None, max_length=8)
    station_pressure: str | None = Field(default=None, max_length=8)
    msl_pressure: str | None = Field(default=None, max_length=8)
    pressure_tendency: str | None = Field(default=None, max_length=2)
    pressure_change: str | None = Field(default=None, max_length=4)
    precip_amount: str | None = Field(default=None, max_length=4)
    precip_period: str | None = Field(default=None, max_length=2)
    present_wx: str | None = Field(default=None, max_length=3)
    past_wx_1: str | None = Field(default=None, max_length=2)
    past_wx_2: str | None = Field(default=None, max_length=2)
    low_cloud_amount: str | None = Field(default=None, max_length=2)
    low_cloud_type: str | None = Field(default=None, max_length=2)
    mid_cloud_type: str | None = Field(default=None, max_length=2)
    high_cloud_type: str | None = Field(default=None, max_length=2)
    s3_state_of_sky: str | None = Field(default=None, max_length=8)
    s3_cloud_dir_low: str | None = Field(default=None, max_length=3)
    s3_cloud_dir_mid: str | None = Field(default=None, max_length=3)
    s3_cloud_dir_high: str | None = Field(default=None, max_length=3)
    s3_max_temp: str | None = Field(default=None, max_length=8)
    s3_min_temp: str | None = Field(default=None, max_length=8)
    s3_baro_change_24h: str | None = Field(default=None, max_length=8)
    s3_rainfall_24h: str | None = Field(default=None, max_length=4)
    s3_layer1_amount: str | None = Field(default=None, max_length=2)
    s3_layer1_form: str | None = Field(default=None, max_length=2)
    s3_layer1_height: str | None = Field(default=None, max_length=4)
    s3_layer2_amount: str | None = Field(default=None, max_length=2)
    s3_layer2_form: str | None = Field(default=None, max_length=2)
    s3_layer2_height: str | None = Field(default=None, max_length=4)
    s3_layer3_amount: str | None = Field(default=None, max_length=2)
    s3_layer3_form: str | None = Field(default=None, max_length=2)
    s3_layer3_height: str | None = Field(default=None, max_length=4)
    s3_layer4_amount: str | None = Field(default=None, max_length=2)
    s3_layer4_form: str | None = Field(default=None, max_length=2)
    s3_layer4_height: str | None = Field(default=None, max_length=4)
    s3_special_phenomena: str | None = Field(default=None, max_length=32)
    s3_remarks: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=4000)


class SynopValidationRequest(BaseModel):
    workbook: SynopWorkbook


class SynopValidationIssue(BaseModel):
    field: str
    code: str
    message: str


class SynopValidationResponse(BaseModel):
    valid: bool
    issues: list[SynopValidationIssue] = Field(default_factory=list)
    normalized: SynopWorkbook


class RegisterObservationWrite(BaseModel):
    station_id: str = Field(min_length=1, max_length=64)
    station_name: str | None = Field(default=None, max_length=200)
    aerodrome_icao: str | None = Field(default=None, min_length=4, max_length=4)
    kind: ObservationKind
    observed_at: UtcDateTime
    issued_at: UtcDateTime | None = None
    body: dict[str, Any] = Field(default_factory=dict)
    raw_tac: str | None = Field(default=None, max_length=12000)
    bufr: dict[str, Any] | None = None
    iwxxm: dict[str, Any] | None = None


class RegisterObservationRead(RegisterObservationWrite):
    id: UUID
    state: RegisterState
    qc_notes: str | None = None
    wis2_topic: str | None = None
    wis2_message_id: str | None = None
    wis2_published_at: UtcDateTime | None = None
    supersedes_id: UUID | None = None
    actor_id: str
    created_at: UtcDateTime
    updated_at: UtcDateTime


class RegisterObservationList(BaseModel):
    observations: list[RegisterObservationRead]


class RegisterObservationCreate(RegisterObservationWrite):
    id: UUID = Field(default_factory=uuid4)
