from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from pydantic import AwareDatetime, ConfigDict, Field, RootModel, StringConstraints

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
    barometer_reading: str | None = Field(
        default=None,
        max_length=8,
        description="Barometer as read (paper column 17), in hPa with one decimal, for example 1013.2.",
    )
    visibility_km: str | None = Field(
        default=None,
        max_length=6,
        description="Visibility as typed, in kilometres; the coded VV is derived from it.",
    )
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
    s3_special_phenomena: str | None = Field(default=None, max_length=120)
    s3_group_909: str | None = Field(
        default=None,
        max_length=8,
        description="Precipitation timing and duration (909Rtdc), the Region IV group 9SpSpspsp with SpSp 09, reported with 6RRRtR: five digits starting 909. Rt and dc are not decoded.",
    )
    time_mark_anemograph: str | None = Field(default=None, max_length=16)
    time_mark_barograph: str | None = Field(default=None, max_length=16)
    time_mark_rain_recorder: str | None = Field(default=None, max_length=16)
    time_mark_thermohygrograph: str | None = Field(default=None, max_length=16)
    s3_sunshine_24h: str | None = Field(default=None, max_length=3)
    s3_ground_state: str | None = Field(default=None, max_length=1)
    s3_ground_jjj: str | None = Field(default=None, max_length=3)
    s5_national: str | None = Field(default=None, max_length=400)
    s3_remarks: str | None = Field(default=None, max_length=4000)
    metar_text: str | None = Field(
        default=None,
        max_length=400,
        description="The METAR typed or copied by the observer; each element is compared with the observation (warnings only).",
    )
    observer_initials: str | None = Field(default=None, max_length=4)
    notes: str | None = Field(default=None, max_length=4000)


class SynopValidationRequest(BaseModel):
    workbook: SynopWorkbook
    observed_at: UtcDateTime | None = Field(
        default=None,
        description="When given, the keyed day and hour must match this UTC time.",
    )


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
    pressure_change_24h_pa: float | None = None
    sunshine_24h_hours: float | None = None
    ground_state: int | None = None
    qfe_pa: float | None = Field(
        default=None,
        description="QFE from the station pressure and the station's QFE offset.",
    )
    qnh_pa: float | None = Field(
        default=None,
        description="QNH from the mean sea level pressure and the station's QNH offset.",
    )


class SynopValidationResponse(BaseModel):
    valid: bool
    issues: list[SynopValidationIssue] = Field(default_factory=list)
    normalized: SynopWorkbook
    decoded: SynopDecoded = Field(default_factory=SynopDecoded)
    expected_metar: str | None = Field(
        default=None,
        description="The METAR the observation implies, for the observer to copy and edit.",
    )


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
    qc_by: str | None = None
    qc_at: UtcDateTime | None = None
    review_outcome: Literal["reviewed", "query"] | None = None
    review_note: str | None = None
    reviewed_by: str | None = None
    reviewed_at: UtcDateTime | None = None
    wis2_topic: str | None = None
    wis2_message_id: str | None = None
    wis2_published_at: UtcDateTime | None = None
    supersedes_id: UUID | None = None
    actor_id: str
    actor_name: str | None = Field(
        default=None, description="Who recorded it (listing only)."
    )
    coded: str | None = Field(
        default=None, description="The coded FM 12 row (SYNOP, listing only)."
    )
    issues: list[SynopValidationIssue] = Field(
        default_factory=list,
        description="Validation findings, warnings included (SYNOP, listing only).",
    )
    created_at: UtcDateTime
    updated_at: UtcDateTime


class RegisterObservationList(BaseModel):
    observations: list[RegisterObservationRead]
    total: int = Field(default=0, description="Matching rows before paging.")


class RegisterObservationCorrection(BaseModel):
    """The replacement for an observation; station, kind and time are kept."""

    model_config = ConfigDict(extra="forbid")

    body: dict[str, Any]
    station_name: str | None = Field(default=None, max_length=200)
    aerodrome_icao: str | None = Field(default=None, min_length=4, max_length=4)
    issued_at: Annotated[UtcDateTime, AwareDatetime()] | None = None
    raw_tac: str | None = Field(default=None, max_length=12000)
    bufr: dict[str, Any] | None = None
    iwxxm: dict[str, Any] | None = None
    reason: str | None = Field(default=None, max_length=1000)


class RegisterObservationCreate(RegisterObservationWrite):
    model_config = ConfigDict(extra="forbid")

    station_id: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
    ]
    observed_at: Annotated[UtcDateTime, AwareDatetime()]
    issued_at: Annotated[UtcDateTime, AwareDatetime()] | None = None
    id: UUID = Field(default_factory=uuid4)


class ReviewRequest(BaseModel):
    outcome: Literal["reviewed", "query"]
    note: str | None = Field(
        default=None,
        max_length=1000,
        description="Required for a query; optional for reviewed.",
    )
    updated_at: Annotated[UtcDateTime, AwareDatetime()] | None = Field(
        default=None,
        description=(
            "`updated_at` of the record the reviewer opened. When sent and the "
            "record changed since, the review is refused with 409."
        ),
    )


class QcDecisionRequest(BaseModel):
    reason: str | None = Field(
        default=None,
        max_length=1000,
        description="Required to reject or reopen; optional note when accepting.",
    )


PressureAmount = Literal[
    "total_correction_hpa", "qfe_offset_hpa", "sea_level_offset_hpa", "qnh_offset_hpa"
]


class StationSettings(BaseModel):
    """Fixed amounts (hPa) the register uses to work out the pressures.

    Station pressure = barometer as read + total correction; QFE = station
    pressure + QFE offset; mean sea level pressure = station pressure + sea level
    offset; QNH = mean sea level pressure + QNH offset. 78958 is seeded with the
    owner-confirmed 0.0, 0.3, 1.0 and 0.1; other stations start empty.
    """

    station_id: str
    total_correction_hpa: float | None = Field(
        default=None, description="Total barometer correction; null until supplied."
    )
    qfe_offset_hpa: float | None = Field(
        default=None, description="QFE minus station pressure; null until supplied."
    )
    sea_level_offset_hpa: float | None = Field(
        default=None,
        description="Mean sea level pressure minus station pressure; null until supplied.",
    )
    qnh_offset_hpa: float | None = Field(
        default=None,
        description="QNH minus mean sea level pressure; null until supplied.",
    )
    pending: list[PressureAmount] = Field(
        default_factory=list, description="The amounts that are still empty."
    )
    updated_at: UtcDateTime | None = None
    updated_by: str | None = None


class StationSettingsUpdate(BaseModel):
    """All four amounts are required: send an explicit null to clear one."""

    total_correction_hpa: float | None = Field(ge=-20, le=20)
    qfe_offset_hpa: float | None = Field(ge=-20, le=20)
    sea_level_offset_hpa: float | None = Field(ge=-20, le=20)
    qnh_offset_hpa: float | None = Field(ge=-20, le=20)


StationSourceKind = Literal["manual", "automatic"]
StationSchedule = Literal["automatic", "manual", "hybrid"]
STATION_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$"
# WMO-No. 1192 WIGOS identifier: 0-<issuer>-<issue number>-<local identifier>.
WIGOS_ID_PATTERN = r"^0-\d{1,5}-\d{1,5}-[A-Za-z0-9]{1,16}$"
ALL_HOURS = list(range(24))
UtcHour = Annotated[int, Field(ge=0, le=23)]


class StationRecord(BaseModel):
    """One station in the observation station registry (ADR-0032)."""

    station_id: str
    name: str | None = None
    wigos_id: str | None = Field(
        default=None, description="WIGOS identifier, for example 0-20000-0-78958."
    )
    source_kind: StationSourceKind = Field(
        description="`manual` observer station or `automatic` weather station."
    )
    schedule: StationSchedule = Field(
        description="Derived publish schedule: `manual` (all 24 hours), `hybrid` "
        "(some hours) or `automatic`."
    )
    manual_hours_utc: list[int] = Field(
        description="UTC hours (0-23) the observer publishes; empty for automatic."
    )
    active: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class StationRecordList(BaseModel):
    stations: list[StationRecord]


class StationCreate(BaseModel):
    """Add a station. An automatic station never has observer hours."""

    station_id: str = Field(pattern=STATION_ID_PATTERN)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    wigos_id: str | None = Field(default=None, pattern=WIGOS_ID_PATTERN)
    source_kind: StationSourceKind
    manual_hours_utc: list[UtcHour] | None = Field(
        default=None,
        max_length=24,
        description="Manual stations only; omitted means all 24 hours.",
    )
    active: bool = True


class StationUpdate(BaseModel):
    """Change a station; omitted keys stay as they are. `station_id` is fixed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    wigos_id: str | None = Field(default=None, pattern=WIGOS_ID_PATTERN)
    source_kind: StationSourceKind | None = None
    manual_hours_utc: list[UtcHour] | None = Field(default=None, max_length=24)
    active: bool | None = None


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
    # Register item 8 (visibility), typed in kilometres.
    visibility_km: float | None = None
    # Register item 11, the gust cell, converted like the wind speed.
    wind_gust_kt: int | None = None
    wind_gust_mph: int | None = None
    # Section 3 maximum and minimum temperature (items 39-42): the observing
    # day's extremes as the observer entered them.
    max_temperature_c: float | None = None
    min_temperature_c: float | None = None
    # Register item 7 (h): the band the lowest cloud base is in. The upper
    # bound is null for "2500 m or more"; both are null when the sky is clear.
    cloud_base_min_m: int | None = None
    cloud_base_max_m: int | None = None


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
    is_correction: bool = False


class ObservationSendList(BaseModel):
    sends: list[ObservationSend]


class SendObservationBody(RootModel[SendObservationRequest | None]):
    """Optional send options. An absent body and null are both accepted."""


class QcDecisionBody(RootModel[QcDecisionRequest | None]):
    """Optional QC decision. An absent body and null are both accepted."""
