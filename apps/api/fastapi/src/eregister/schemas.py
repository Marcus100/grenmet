from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from pydantic import AwareDatetime, ConfigDict, Field, StringConstraints

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
    wind_gust: str | None = Field(default=None, max_length=3)
    air_temp: str | None = Field(default=None, max_length=8)
    wet_bulb: str | None = Field(default=None, max_length=8)
    dew_point: str | None = Field(default=None, max_length=8)
    relative_humidity: str | None = Field(default=None, max_length=3)
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
    observer_initials: str | None = Field(default=None, max_length=4)
    notes: str | None = Field(default=None, max_length=4000)


class SynopValidationRequest(BaseModel):
    workbook: SynopWorkbook


class SynopValidationIssue(BaseModel):
    field: str
    code: str
    message: str
    severity: Literal["error", "warning"] = "error"


class SynopDecoded(BaseModel):
    """SI values decoded from the coded groups; missing or unobserved is null."""

    international_data_subcategory: int | None = None
    is_nil_report: bool = False
    air_temperature_k: float | None = None
    wet_bulb_k: float | None = None
    dew_point_k: float | None = None
    max_temperature_k: float | None = None
    min_temperature_k: float | None = None
    station_pressure_pa: float | None = None
    mean_sea_level_pressure_pa: float | None = None
    wind_direction_deg: int | None = None
    wind_speed_ms: float | None = None
    wind_gust_ms: float | None = None
    relative_humidity_percent: int | None = None
    visibility_m: float | None = None
    total_cloud_percent: int | None = None
    precipitation_kg_m2: float | None = None
    rainfall_24h_kg_m2: float | None = None


class SynopValidationResponse(BaseModel):
    valid: bool
    issues: list[SynopValidationIssue] = Field(default_factory=list)
    normalized: SynopWorkbook
    decoded: SynopDecoded = Field(default_factory=SynopDecoded)


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
    model_config = ConfigDict(extra="forbid")

    station_id: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
    ]
    observed_at: Annotated[UtcDateTime, AwareDatetime()]
    issued_at: Annotated[UtcDateTime, AwareDatetime()] | None = None
    id: UUID = Field(default_factory=uuid4)


PressureTrend = Literal["rising", "steady", "falling"]


class PublicObservation(BaseModel):
    """Decoded, public subset of one MBIA SYNOP; no staff or QC fields."""

    station_id: str
    station_name: str | None = None
    observed_at: UtcDateTime
    status: Literal["provisional", "accepted"]
    temperature_c: float | None = None
    dew_point_c: float | None = None
    relative_humidity: int | None = None
    wind_calm: bool = False
    wind_direction_deg: int | None = None
    wind_direction: str | None = None
    wind_speed_kt: int | None = None
    wind_speed_mph: int | None = None
    msl_pressure_hpa: float | None = None
    pressure_trend: PressureTrend | None = None
    pressure_change_hpa: float | None = None
    rain_mm: float | None = None
    rain_trace: bool = False
    rain_period_hours: int | None = None
    rain_24h_mm: float | None = None
    weather: str | None = None
    cloud_oktas: int | None = None
    cloud: str | None = None


class PublicCurrentConditions(BaseModel):
    observation: PublicObservation | None = None


class PublicMonthSummary(BaseModel):
    """MBIA month-to-date figures aggregated from the register; no staff fields."""

    station_id: str
    station_name: str | None = None
    month: str
    period_start: UtcDateTime
    period_end: UtcDateTime
    last_observation_at: UtcDateTime
    observation_count: int
    days_elapsed: int
    rain_report_days: int
    rainfall_mm: float | None = None
    rain_days: int | None = None
    rain_day_threshold_mm: float
    max_temperature_c: float | None = None
    max_temperature_at: UtcDateTime | None = None
    min_temperature_c: float | None = None
    min_temperature_at: UtcDateTime | None = None
    provisional: bool


class PublicMonthSummaryResponse(BaseModel):
    summary: PublicMonthSummary | None = None


SendTarget = Literal["email", "wis2"]
SendStatus = Literal["queued", "sent", "failed"]


class SendObservationRequest(BaseModel):
    resend: bool = Field(
        default=False,
        description="Send again although this observation already went to the same target.",
    )


class ObservationSend(BaseModel):
    """One email or WIS2 hand-off of a register observation."""

    id: UUID
    observation_id: UUID
    target: SendTarget
    status: SendStatus
    recipients: int | None = None
    attempts: int
    last_error: str | None = None
    queued_at: UtcDateTime
    sent_at: UtcDateTime | None = None


class ObservationSendList(BaseModel):
    sends: list[ObservationSend]
