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
    model_config = ConfigDict(extra="forbid")

    values: ValuesT
    expectedRevision: Annotated[int, Field(strict=True, ge=0)]
    changeSummary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=1000)
    ]


class ProductPreviewBase[ValuesT](BaseModel):
    values: ValuesT
    errors: list[str]
    checked_at: UtcDateTime


class ProductPdfSourceBase[ValuesT](BaseModel):
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


class ProductFeedError(BaseModel):
    error: str


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
    """One display tile: a lucide icon name, a formatted value and its label."""

    icon: str
    value: str
    label: str


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
