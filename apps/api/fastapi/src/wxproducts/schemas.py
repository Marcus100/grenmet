from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Self
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


class PublishedProduct(BaseModel):
    id: UUID
    revision: int = Field(gt=0)
    publishedAt: str
    kind: ProductKind
    values: dict[str, str]

    @field_validator("publishedAt")
    @classmethod
    def valid_publication_time(cls, value: str) -> str:
        TypeAdapter(AwareDatetime).validate_python(value)
        return value


class PublishedProducts(BaseModel):
    products: list[PublishedProduct]


class ProductFeedError(BaseModel):
    error: str


class ProductWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    expectedRevision: Annotated[int, Field(strict=True, ge=0)]
    kind: ProductKind
    values: dict[
        Annotated[str, StringConstraints(max_length=80)],
        Annotated[str, StringConstraints(max_length=12_000)],
    ]
    action: Literal["draft", "publish", "withdraw"]
    changeSummary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=1000)
    ]
    reviewed: StrictBool


class StoredProduct(BaseModel):
    id: UUID
    kind: ProductKind
    values: dict[str, str]
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


class ForecastPeriod(BaseModel):
    date: str
    valid_from: UtcDateTime
    valid_to: UtcDateTime
    source: ForecastSource | None = None
    period_key: str = ""
    high: float | None = None
    low: float | None = None
    details: dict[str, str] = Field(default_factory=dict)


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


class ProductPreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ProductKind
    values: dict[
        Annotated[str, StringConstraints(max_length=80)],
        Annotated[str, StringConstraints(max_length=12_000)],
    ]
    expectedRevision: Annotated[int, Field(strict=True, ge=0)]
    changeSummary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=1000)
    ]


class ProductPreview(BaseModel):
    values: dict[str, str]
    errors: list[str]
    checked_at: UtcDateTime


class ProductPdfSource(BaseModel):
    product_id: UUID
    revision: int
    kind: ProductKind
    values: dict[str, str]
    action: Literal["draft", "publish", "withdraw"]
    recorded_at: UtcDateTime
    current_publication: bool
