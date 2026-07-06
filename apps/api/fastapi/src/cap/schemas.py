import uuid
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from src.cap.models import (
    CapAreaKind,
    CapCategory,
    CapCertainty,
    CapIntegrationStatus,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.models import BaseModel, UtcDateTime


class CapNameValue(BaseModel):
    value_name: str = Field(min_length=1, max_length=255)
    value: str = Field(min_length=1, max_length=1000)


class CapResourceBase(BaseModel):
    resource_desc: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=120)
    size: int | None = Field(default=None, ge=0)
    uri: str | None = Field(default=None, max_length=1000)
    deref_uri: str | None = None
    digest: str | None = Field(default=None, max_length=255)


class CapResourceCreate(CapResourceBase):
    pass


class CapResourcePublic(CapResourceBase):
    id: uuid.UUID
    sequence: int


class CapAreaBase(BaseModel):
    kind: CapAreaKind = CapAreaKind.AREA
    area_desc: str = Field(min_length=1, max_length=1000)
    predefined_area_id: uuid.UUID | None = None
    polygons: list[list[list[float]]] = Field(default_factory=list)
    multipolygons: list[list[list[list[float]]]] = Field(default_factory=list)
    circles: list[dict[str, float]] = Field(default_factory=list)
    geocodes: list[CapNameValue] = Field(default_factory=list)
    geometry: dict[str, Any] | None = None
    altitude: float | None = None
    ceiling: float | None = None


class CapAreaCreate(CapAreaBase):
    pass


class CapAreaPublic(CapAreaBase):
    id: uuid.UUID
    sequence: int
    geocodes: list[CapNameValue] = Field(default_factory=list)


class CapInfoBase(BaseModel):
    language: str = Field(default="en", min_length=2, max_length=35)
    categories: list[CapCategory] = Field(default_factory=lambda: [CapCategory.MET])
    event: str = Field(min_length=1, max_length=255)
    event_codes: list[CapNameValue] = Field(default_factory=list)
    response_types: list[str] = Field(default_factory=list)
    urgency: CapUrgency = CapUrgency.EXPECTED
    severity: CapSeverity = CapSeverity.MODERATE
    certainty: CapCertainty = CapCertainty.LIKELY
    audience: str | None = Field(default=None, max_length=500)
    effective: UtcDateTime | None = None
    onset: UtcDateTime | None = None
    expires: UtcDateTime | None = None
    sender_name: str | None = Field(default=None, max_length=255)
    headline: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=4000)
    instruction: str | None = Field(default=None, max_length=4000)
    web: str | None = Field(default=None, max_length=500)
    contact: str | None = Field(default=None, max_length=500)
    parameters: list[CapNameValue] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_time_order(self) -> "CapInfoBase":
        if self.effective and self.onset and self.onset < self.effective:
            raise ValueError("onset must be on or after effective")
        if self.onset and self.expires and self.expires <= self.onset:
            raise ValueError("expires must be after onset")
        if self.effective and self.expires and self.expires <= self.effective:
            raise ValueError("expires must be after effective")
        return self


class CapInfoCreate(CapInfoBase):
    resources: list[CapResourceCreate] = Field(default_factory=list)
    areas: list[CapAreaCreate] = Field(default_factory=list)


class CapInfoPublic(CapInfoBase):
    id: uuid.UUID
    sequence: int
    resources: list[CapResourcePublic] = Field(default_factory=list)
    areas: list[CapAreaPublic] = Field(default_factory=list)


class CapReferenceBase(BaseModel):
    sender: str = Field(min_length=1, max_length=255)
    identifier: str = Field(min_length=1, max_length=255)
    sent: UtcDateTime


class CapReferenceCreate(CapReferenceBase):
    pass


class CapReferencePublic(CapReferenceBase):
    id: uuid.UUID
    sequence: int


class CapAlertBase(BaseModel):
    identifier: str | None = Field(default=None, max_length=255)
    sender: str | None = Field(default=None, max_length=255)
    sent: UtcDateTime | None = None
    status: CapStatus = CapStatus.DRAFT
    msg_type: CapMessageType = CapMessageType.ALERT
    source: str | None = Field(default=None, max_length=255)
    scope: CapScope = CapScope.PUBLIC
    restriction: str | None = Field(default=None, max_length=500)
    addresses: list[str] = Field(default_factory=list)
    codes: list[str] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=2000)
    references: list[CapReferenceCreate] = Field(default_factory=list)
    incidents: list[str] = Field(default_factory=list)
    info: list[CapInfoCreate] = Field(default_factory=list)

    @field_validator("addresses", "codes", "incidents")
    @classmethod
    def _strip_list_values(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]

    @model_validator(mode="after")
    def _validate_scope_and_references(self) -> "CapAlertBase":
        if self.scope == CapScope.RESTRICTED and not self.restriction:
            raise ValueError("restriction is required when scope is Restricted")
        if self.scope == CapScope.PRIVATE and not self.addresses:
            raise ValueError("addresses are required when scope is Private")
        if self.msg_type != CapMessageType.ALERT and not self.references:
            raise ValueError(
                "references are required for Update, Cancel, Ack, and Error"
            )
        return self


class CapAlertCreate(CapAlertBase):
    pass


class CapAlertImportRequest(BaseModel):
    source: Literal["url", "xml"] = "xml"
    value: str = Field(min_length=1)


class CapFeedImportCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=1000)


class CapFeedImportUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, min_length=1, max_length=1000)
    status: CapIntegrationStatus | None = None


class CapFeedImportPublic(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    status: CapIntegrationStatus
    last_checked_at: UtcDateTime | None = None
    last_error: str | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CapAlertUpdate(BaseModel):
    identifier: str | None = Field(default=None, max_length=255)
    sender: str | None = Field(default=None, max_length=255)
    sent: UtcDateTime | None = None
    status: CapStatus | None = None
    msg_type: CapMessageType | None = None
    source: str | None = Field(default=None, max_length=255)
    scope: CapScope | None = None
    restriction: str | None = Field(default=None, max_length=500)
    addresses: list[str] | None = None
    codes: list[str] | None = None
    note: str | None = Field(default=None, max_length=2000)
    references: list[CapReferenceCreate] | None = None
    incidents: list[str] | None = None
    info: list[CapInfoCreate] | None = None


class CapAlertPublic(BaseModel):
    id: uuid.UUID
    identifier: str
    sender: str
    sent: UtcDateTime
    status: CapStatus
    msg_type: CapMessageType
    source: str | None = None
    scope: CapScope
    restriction: str | None = None
    addresses: list[str] = Field(default_factory=list)
    codes: list[str] = Field(default_factory=list)
    note: str | None = None
    lifecycle_state: CapLifecycleState
    created_by_user_id: uuid.UUID
    updated_by_user_id: uuid.UUID | None = None
    submitted_at: UtcDateTime | None = None
    approved_at: UtcDateTime | None = None
    published_at: UtcDateTime | None = None
    expired_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime
    references: list[CapReferencePublic] = Field(default_factory=list)
    incidents: list[str] = Field(default_factory=list)
    info: list[CapInfoPublic] = Field(default_factory=list)
    xml_url: str | None = None


class CapAlertListPublic(BaseModel):
    data: list[CapAlertPublic]
    count: int
    page: int = 1
    size: int = 100


class CapAlertAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class CapValidationResult(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CapSnapshotPublic(BaseModel):
    id: uuid.UUID
    alert_id: uuid.UUID
    identifier: str
    content_hash: str
    generated_at: UtcDateTime
    signed_at: UtcDateTime | None = None
    signing_key_ref: str | None = None


class CapPublishPublic(BaseModel):
    alert: CapAlertPublic
    snapshot: CapSnapshotPublic


class CapSettingsPublic(BaseModel):
    id: uuid.UUID
    sender: str
    sender_name: str
    wmo_oid: str | None = None
    web: str | None = None
    contact: str | None = None
    feed_limit: int
    signing_enabled: bool
    signing_certificate_ref: str | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CapSettingsUpdate(BaseModel):
    sender: str | None = Field(default=None, min_length=1, max_length=255)
    sender_name: str | None = Field(default=None, min_length=1, max_length=255)
    wmo_oid: str | None = Field(default=None, max_length=120)
    web: str | None = Field(default=None, max_length=500)
    contact: str | None = Field(default=None, max_length=500)
    feed_limit: int | None = Field(default=None, ge=1, le=500)
    signing_enabled: bool | None = None
    signing_certificate_ref: str | None = Field(default=None, max_length=255)


class CapCatalogsPublic(BaseModel):
    categories: list[str]
    response_types: list[str]
    urgencies: list[str]
    severities: list[str]
    certainties: list[str]
    statuses: list[str]
    message_types: list[str]
    scopes: list[str]
    languages: list[str]


class CapPredefinedAreaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    area_desc: str = Field(min_length=1, max_length=1000)
    geometry: dict[str, Any] | None = None
    polygons: list[list[list[float]]] = Field(default_factory=list)
    multipolygons: list[list[list[list[float]]]] = Field(default_factory=list)
    circles: list[dict[str, float]] = Field(default_factory=list)
    geocodes: list[CapNameValue] = Field(default_factory=list)
    is_active: bool = True


class CapPredefinedAreaPublic(CapPredefinedAreaCreate):
    id: uuid.UUID
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CapIntegrationPublic(BaseModel):
    id: uuid.UUID
    name: str
    status: CapIntegrationStatus
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CapAuditEventPublic(BaseModel):
    id: uuid.UUID
    alert_id: uuid.UUID | None = None
    actor_user_id: uuid.UUID | None = None
    action: str
    previous_state: str | None = None
    next_state: str | None = None
    note: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: UtcDateTime


class CapAuditEventListPublic(BaseModel):
    data: list[CapAuditEventPublic]
    count: int
    page: int = 1
    size: int = 100
