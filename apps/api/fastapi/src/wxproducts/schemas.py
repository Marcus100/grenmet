from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Self, TypeVar
from uuid import UUID

from pydantic import (
    AwareDatetime,
    ConfigDict,
    Field,
    StrictBool,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

from src.models import BaseModel, UtcDateTime
from src.wxwatch.nhc_schemas import GuidanceFeatureType, ProductGuidance

from .models import AuthoredProduct

ProductKind = Literal[
    "morning",
    "midday",
    "evening",
    "outlook",
    "cyclone",
    "marine",
    "flood",
    "thunderstorm",
    "wind",
    "heat",
    "dust",
    "coastal",
    "tsunami",
]
LegacyProductKind = Literal[
    "morning",
    "midday",
    "evening",
    "cyclone",
    "marine",
    "flood",
    "thunderstorm",
    "wind",
    "heat",
    "dust",
    "coastal",
    "tsunami",
]
LocalDateTime = Annotated[
    str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
]
ValuesT = TypeVar("ValuesT")
WriteValues = dict[
    Annotated[str, StringConstraints(max_length=80)],
    Annotated[str, StringConstraints(max_length=12_000)],
]


class IssueDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issuedAt: LocalDateTime | None = None
    validFrom: LocalDateTime | None = None
    validTo: LocalDateTime | None = None
    validity: str | None = None
    area: str | None = None
    forecaster: str | None = None


class PublishedProductBase[ValuesT](BaseModel):
    id: UUID
    revision: int = Field(gt=0)
    publishedAt: str
    values: ValuesT

    @field_validator("publishedAt")
    @classmethod
    def valid_publication_time(cls, value: str) -> str:
        TypeAdapter(AwareDatetime).validate_python(value)
        return value


class StoredProductBase[ValuesT](BaseModel):
    guidance: ProductGuidance | None = None
    id: UUID
    values: ValuesT
    revision: int
    publishedRevision: int | None
    updatedAt: UtcDateTime

    @model_validator(mode="before")
    @classmethod
    def from_record(cls, value: Any) -> Any:
        if isinstance(value, AuthoredProduct):
            return {
                **value.draft,
                "id": value.id,
                "revision": value.revision,
                "publishedRevision": value.published["revision"]
                if value.published
                else None,
                "updatedAt": value.updated_at,
            }
        return value


class ProductWriteBase[ValuesT](BaseModel):
    guidance: ProductGuidance | None = None
    model_config = ConfigDict(extra="forbid")

    id: UUID
    expectedRevision: Annotated[int, Field(strict=True, ge=0)]
    values: ValuesT
    action: Literal["draft", "publish", "withdraw"]
    changeSummary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=1000)
    ]
    reviewed: StrictBool


class ProductPreviewInputBase[ValuesT](BaseModel):
    guidance: ProductGuidance | None = None
    model_config = ConfigDict(extra="forbid")

    values: ValuesT
    expectedRevision: Annotated[int, Field(strict=True, ge=0)]
    changeSummary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=1000)
    ]


class ProductPreviewBase[ValuesT](BaseModel):
    guidance: ProductGuidance | None = None
    values: ValuesT
    errors: list[str]
    checked_at: UtcDateTime


class ProductPdfSourceBase[ValuesT](BaseModel):
    guidance: ProductGuidance | None = None
    product_id: UUID
    revision: int
    values: ValuesT
    action: Literal["draft", "publish", "withdraw"]
    recorded_at: UtcDateTime
    current_publication: bool


class OutlookValuesDraft(IssueDetails):
    model_config = ConfigDict(extra="forbid")

    source: str | None = None
    specialInterest: str | None = None
    systems: str | None = None
    formation: str | None = None
    # NHC-style formation probabilities in percent (optional; older outlooks lack them).
    formationChance48h: str | None = None
    formationChance7d: str | None = None
    nextUpdate: LocalDateTime | None = None


class OutlookValuesPublished(OutlookValuesDraft):
    issuedAt: LocalDateTime
    validFrom: LocalDateTime
    validTo: LocalDateTime
    area: str
    forecaster: str
    source: str
    specialInterest: str
    systems: str
    formation: str
    nextUpdate: LocalDateTime


class OutlookPublishedProduct(PublishedProductBase[OutlookValuesPublished]):
    kind: Literal["outlook"]


class OutlookStoredProduct(StoredProductBase[OutlookValuesDraft]):
    kind: Literal["outlook"]


class OutlookProductWrite(ProductWriteBase[OutlookValuesDraft]):
    kind: Literal["outlook"]


class OutlookProductPreviewInput(ProductPreviewInputBase[OutlookValuesDraft]):
    kind: Literal["outlook"]


class OutlookProductPreview(ProductPreviewBase[OutlookValuesDraft]):
    kind: Literal["outlook"]


class OutlookProductPdfSource(ProductPdfSourceBase[OutlookValuesDraft]):
    kind: Literal["outlook"]


class LegacyPublishedProduct(PublishedProductBase[dict[str, str]]):
    kind: LegacyProductKind


class LegacyStoredProduct(StoredProductBase[dict[str, str]]):
    kind: LegacyProductKind


class LegacyProductWrite(ProductWriteBase[WriteValues]):
    kind: LegacyProductKind


class LegacyProductPreviewInput(ProductPreviewInputBase[WriteValues]):
    kind: LegacyProductKind


class LegacyProductPreview(ProductPreviewBase[dict[str, str]]):
    kind: LegacyProductKind


class LegacyProductPdfSource(ProductPdfSourceBase[dict[str, str]]):
    kind: LegacyProductKind


PublishedProduct = Annotated[
    OutlookPublishedProduct | LegacyPublishedProduct, Field(discriminator="kind")
]
StoredProduct = Annotated[
    OutlookStoredProduct | LegacyStoredProduct, Field(discriminator="kind")
]
ProductWrite = Annotated[
    OutlookProductWrite | LegacyProductWrite, Field(discriminator="kind")
]
ProductPreviewInput = Annotated[
    OutlookProductPreviewInput | LegacyProductPreviewInput, Field(discriminator="kind")
]
ProductPreview = Annotated[
    OutlookProductPreview | LegacyProductPreview, Field(discriminator="kind")
]
ProductPdfSource = Annotated[
    OutlookProductPdfSource | LegacyProductPdfSource, Field(discriminator="kind")
]

PublishedProductAdapter: TypeAdapter[PublishedProduct] = TypeAdapter(PublishedProduct)
StoredProductAdapter: TypeAdapter[StoredProduct] = TypeAdapter(StoredProduct)
ProductWriteAdapter: TypeAdapter[ProductWrite] = TypeAdapter(ProductWrite)
ProductPreviewInputAdapter: TypeAdapter[ProductPreviewInput] = TypeAdapter(
    ProductPreviewInput
)
ProductPreviewAdapter: TypeAdapter[ProductPreview] = TypeAdapter(ProductPreview)
ProductPdfSourceAdapter: TypeAdapter[ProductPdfSource] = TypeAdapter(ProductPdfSource)


def values_as_dict(values: BaseModel | dict[str, str]) -> dict[str, str]:
    if isinstance(values, BaseModel):
        return values.model_dump(mode="json", exclude_none=True)
    return dict(values)


class PublicPublishedProduct(BaseModel):
    """Compatibility response shape for anonymous public consumers."""

    id: UUID
    revision: int = Field(gt=0)
    publishedAt: Annotated[UtcDateTime, AwareDatetime()]
    kind: ProductKind
    values: dict[str, str]


class PublishedProducts(BaseModel):
    products: list[PublicPublishedProduct]


class PublicProductDetail(PublicPublishedProduct):
    """One published snapshot by id, for editorial links to a product.

    Unlike the feed it stays readable after its validity window; `current` says
    whether it is still in force. Withdrawn products are not returned.
    """

    current: bool


class ProductFeedError(BaseModel):
    error: str


class SectorOutlookItem(BaseModel):
    """One alert or warning that applies to the coming days, with its sectors."""

    source: Literal["CAP", "Bulletin"]
    title: str
    product: str
    colour: Literal["green", "yellow", "orange", "red"] | None = None
    likelihood: str | None = None
    impact: str | None = None
    impacts: str
    response: str
    valid_from: UtcDateTime | None = None
    valid_to: UtcDateTime | None = None
    reference: str
    # Where the full text lives: a CAP warning's identifier or a bulletin's id.
    identifier: str | None = None
    product_id: UUID | None = None
    # Known sectors, in menu order. Empty means untagged: affects everyone.
    sectors: list[str]
    affects_everyone: bool


class SectorOutlook(BaseModel):
    as_of: UtcDateTime
    window_start: UtcDateTime
    window_end: UtcDateTime
    # False when a source (CAP or bulletins) could not be read: the site must
    # say so, never show an all-clear.
    complete: bool
    items: list[SectorOutlookItem]


class AuthoredProducts(BaseModel):
    products: list[StoredProduct]


class ProductHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    revision: int
    action: Literal["draft", "publish", "withdraw"]
    actorName: str = Field(validation_alias="actor_name")
    changeSummary: str = Field(validation_alias="change_summary")
    createdAt: UtcDateTime = Field(validation_alias="created_at")


class ProductHistory(BaseModel):
    history: list[ProductHistoryEntry]


class AuthoringError(BaseModel):
    detail: str | list[dict[str, Any]]


class ForecastSource(BaseModel):
    product_id: UUID
    revision: int
    kind: ProductKind
    issued_at: UtcDateTime
    published_at: UtcDateTime


class ForecastCondition(BaseModel):
    """One display tile: a lucide icon name, a formatted value and its label.

    `value` is the text in GMS's default units. When the tile is a measurement,
    `quantity`, `low` and `high` carry the numbers in WMO storage units (degC,
    knots, metres) so the site can show them in the visitor's unit system.
    """

    icon: str
    value: str
    label: str
    quantity: Literal["temperature", "speed", "height"] | None = None
    low: float | None = None
    high: float | None = None


class ForecastPeriod(BaseModel):
    date: str
    valid_from: UtcDateTime
    valid_to: UtcDateTime
    source: ForecastSource | None = None
    period_key: str = ""
    high: float | None = None
    low: float | None = None
    details: dict[str, str] = Field(default_factory=dict)
    conditions: list[ForecastCondition] = Field(default_factory=list)


class ForecastObservation(BaseModel):
    temperature: float
    source: ForecastSource
    time_basis: Literal["product_issue"] = "product_issue"


class PublicForecast(BaseModel):
    as_of: UtcDateTime
    timezone: Literal["America/Grenada"] = "America/Grenada"
    base_date: str
    periods: list[ForecastPeriod] = Field(min_length=5, max_length=5)
    observation: ForecastObservation | None = None
    # Every current issue for the base date, oldest first; the last one is
    # periods[0]. Lets the public site offer earlier issues beside the newest.
    today_issues: list[ForecastPeriod] = Field(default_factory=list)


AviationKind = Literal["METAR", "SPECI", "TAF"]


class AviationContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: AviationKind
    station: Annotated[str, StringConstraints(pattern=r"^[A-Z]{4}$")]
    message: Annotated[str, StringConstraints(min_length=1, max_length=6000)]
    observed_at: UtcDateTime | None = None
    issued_at: UtcDateTime | None = None
    valid_from: UtcDateTime | None = None
    valid_to: UtcDateTime | None = None

    @field_validator("observed_at", "issued_at", "valid_from", "valid_to")
    @classmethod
    def explicit_utc(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("Time must include a UTC offset; use Z for UTC")
            return value.astimezone(UTC)
        return value

    @field_validator("message")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a coded message")
        return value

    @model_validator(mode="after")
    def validity_order(self) -> Self:
        if (self.valid_from is None) != (self.valid_to is None):
            raise ValueError("Supply both validity times or leave both unknown")
        if self.valid_from and self.valid_to and self.valid_to <= self.valid_from:
            raise ValueError("Validity end must be after validity start")
        return self


class AviationDraftWrite(AviationContent):
    id: UUID
    expected_revision: Annotated[int, Field(strict=True, ge=0)]


class AviationDraftRead(AviationContent):
    id: UUID
    revision: int
    actor_id: str
    actor_name: str
    updated_at: UtcDateTime
    state: Literal["draft"] = "draft"
    time_basis: Literal["staff_supplied"] = "staff_supplied"


class AviationDraftList(BaseModel):
    drafts: list[AviationDraftRead]


class AviationRevisionRead(AviationContent):
    revision: int
    actor_id: str
    actor_name: str
    recorded_at: UtcDateTime


class AviationHistory(BaseModel):
    revisions: list[AviationRevisionRead]


class AviationValidationRequest(AviationContent):
    """A coded message to check; same fields as a draft, nothing is saved."""

    previous_message: Annotated[str, StringConstraints(max_length=6000)] | None = Field(
        default=None,
        description=(
            "The preceding METAR or SPECI. For a SPECI it is compared with the "
            "Annex 3 App. 3 2.3 criteria (advisory warnings)."
        ),
    )


class AviationIssue(BaseModel):
    """One coded-message finding. `error` is a code violation; `warning` is practice."""

    severity: Literal["error", "warning"]
    code: str
    group: str | None = None
    message: str
    rule: str


class AviationValidationResponse(BaseModel):
    valid: bool
    issues: list[AviationIssue] = Field(default_factory=list)


TropicalSystemStatus = Literal["active", "closed"]
TropicalSystemClosedReason = Literal["dissipated", "merged", "out_of_area", "duplicate"]
# NHC ids carry the season year so they never collide across seasons. Storms are
# numbered 01-89; invests 90-99.
NhcSystemId = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        pattern=r"^[A-Za-z]{2}(0[1-9]|[1-8]\d)\d{4}$",
    ),
]
NhcInvestId = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z]{2}9\d\d{4}$"
    ),
]


# On update the shape is checked in the service, only when the value changes, so a
# system saved with an older short id (al07) can still be sent back unchanged.
NhcStoredId = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=20)
]


class TropicalSystemCreate(BaseModel):
    """Start tracking a system by hand. The label (GMS season-sequence) is assigned."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)
    ]
    feature_type: GuidanceFeatureType
    season: Annotated[int, Field(ge=2000, le=2100)] | None = Field(
        default=None, description="Defaults to the current year in Grenada."
    )
    nhc_storm_id: NhcSystemId | None = Field(
        default=None, description="NHC storm identifier such as al072026."
    )
    nhc_invest_id: NhcInvestId | None = Field(
        default=None, description="NHC invest identifier such as al902026."
    )


class TropicalSystemUpdate(BaseModel):
    """Rename, link NHC identifiers, close or merge. Omitted fields stay unchanged."""

    model_config = ConfigDict(extra="forbid")

    name: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)
        ]
        | None
    ) = None
    feature_type: GuidanceFeatureType | None = None
    nhc_storm_id: NhcStoredId | None = Field(
        default=None,
        description="Must match al072026 when it changes; an unchanged older id is accepted.",
    )
    nhc_invest_id: NhcStoredId | None = Field(
        default=None,
        description="Must match al942026 when it changes; an unchanged older id is accepted.",
    )
    status: TropicalSystemStatus | None = None
    closed_reason: TropicalSystemClosedReason | None = None
    continued_as_id: UUID | None = None
    reason: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
        ]
        | None
    ) = Field(default=None, description="Why the change was made (audit trail).")


class TropicalSystemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    season: int
    sequence: int
    name: str
    feature_type: GuidanceFeatureType
    nhc_storm_id: str | None
    nhc_invest_id: str | None
    status: TropicalSystemStatus
    closed_reason: TropicalSystemClosedReason | None
    continued_as_id: UUID | None
    first_issued_at: UtcDateTime | None
    last_issued_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class TropicalSystemList(BaseModel):
    systems: list[TropicalSystemRead]


class TropicalSystemPublicEntry(BaseModel):
    """One published outlook issue's view of a system."""

    model_config = ConfigDict(from_attributes=True)

    product_id: UUID
    revision: int
    issued_at: UtcDateTime
    name: str
    feature_type: GuidanceFeatureType
    latitude: float | None
    longitude: float | None
    movement_direction: str | None
    movement_speed_kt: float | None
    formation_48h: int | None
    formation_7d: int | None


class TropicalSystemEntryRead(TropicalSystemPublicEntry):
    """Staff view of an entry, drafts included."""

    action: Literal["draft", "publish"]
    source_edition_ids: list[UUID]


class TropicalSystemHistory(BaseModel):
    system: TropicalSystemRead
    entries: list[TropicalSystemEntryRead]


class TropicalSystemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    name: str
    feature_type: GuidanceFeatureType
    nhc_storm_id: str | None
    status: TropicalSystemStatus
    latest: TropicalSystemPublicEntry


class TropicalSystemPublicList(BaseModel):
    systems: list[TropicalSystemPublic]


class TropicalSystemPublicHistory(BaseModel):
    id: UUID
    label: str
    name: str
    feature_type: GuidanceFeatureType
    nhc_storm_id: str | None
    status: TropicalSystemStatus
    entries: list[TropicalSystemPublicEntry]
