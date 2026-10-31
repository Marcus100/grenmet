import math
import re
import uuid
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import (
    AwareDatetime,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from src.cap.models import (
    CapAreaKind,
    CapCategory,
    CapCertainty,
    CapIntegrationStatus,
    CapLifecycleState,
    CapMessageType,
    CapResponseType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.models import BaseModel, UtcDateTime

# Largest import (and feed entry) we read, in bytes; the import request caps its text to match.
MAX_IMPORT_CHARS = 5 * 1024 * 1024

# XML 1.0 Char production: what a CAP document may carry at all.
WMO_OID = re.compile(r"2\.49\.0\.1\.\d+\.\d+")


def _xml_char(char: str) -> bool:
    """True for characters the XML 1.0 Char production allows."""
    code = ord(char)
    return (
        code in (0x9, 0xA, 0xD)
        or 0x20 <= code <= 0xD7FF
        or 0xE000 <= code <= 0xFFFD
        or 0x10000 <= code <= 0x10FFFF
    )


def clean_xml_text(value: str, field: str) -> str:
    """Return ``value`` ready for CAP XML, or raise a 422 that names ``field``.

    Vertical tab and form feed (what Word writes for soft breaks) become newlines,
    so they are not an error. Any other character XML 1.0 forbids is refused here,
    on save, rather than failing at publish.
    """
    value = value.replace("\x0b", "\n").replace("\x0c", "\n")
    bad = next((char for char in value if not _xml_char(char)), None)
    if bad is not None:
        raise ValueError(
            f"{field} contains a character that CAP XML cannot carry "
            f"(U+{ord(bad):04X}). Remove it."
        )
    return value


class CapTextInput(BaseModel):
    """Text a forecaster types. Every string field must be carriable in CAP XML."""

    @field_validator("*", mode="after")
    @classmethod
    def _xml_carriable_text(cls, value: Any, info: ValidationInfo) -> Any:
        # Enum members are str subclasses: pass them through, so they keep their type.
        name = info.field_name or "field"
        if isinstance(value, Enum):
            return value
        if isinstance(value, str):
            return clean_xml_text(value, name)
        if isinstance(value, list) and value and all(type(v) is str for v in value):
            return [clean_xml_text(v, name) for v in value]
        return value


def _all_finite(value: object) -> bool:
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_all_finite(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return all(_all_finite(item) for item in value)
    return True


class CapNameValue(CapTextInput):
    value_name: str = Field(min_length=1, max_length=255)
    value: str = Field(min_length=1, max_length=1000)


class CapResourceBase(BaseModel):
    resource_desc: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=120)
    size: int | None = Field(default=None, ge=0)
    uri: str | None = Field(default=None, max_length=1000)
    deref_uri: str | None = None
    digest: str | None = Field(default=None, max_length=255)


class CapResourceCreate(CapResourceBase, CapTextInput):
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


class CapAreaCreate(CapAreaBase, CapTextInput):
    """Save-time checks: a height and every coordinate must be a finite number."""

    @field_validator("altitude", "ceiling")
    @classmethod
    def _finite_height(cls, value: float | None, info: ValidationInfo) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError(f"{info.field_name} must be a finite number")
        return value

    @field_validator("polygons", "multipolygons", "circles")
    @classmethod
    def _finite_geometry(cls, value: Any, info: ValidationInfo) -> Any:
        if not _all_finite(value):
            raise ValueError(f"{info.field_name} must contain only finite numbers")
        return value


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
    def _validate_time_order(self) -> CapInfoBase:
        if self.effective and self.onset and self.onset < self.effective:
            raise ValueError("onset must be on or after effective")
        if self.onset and self.expires and self.expires <= self.onset:
            raise ValueError("expires must be after onset")
        if self.effective and self.expires and self.expires <= self.effective:
            raise ValueError("expires must be after effective")
        return self


class CapInfoCreate(CapInfoBase, CapTextInput):
    """Save-time checks. They run on what a forecaster types, not on stored rows."""

    effective: Annotated[UtcDateTime, AwareDatetime()] | None = None
    onset: Annotated[UtcDateTime, AwareDatetime()] | None = None
    expires: Annotated[UtcDateTime, AwareDatetime()] | None = None
    resources: list[CapResourceCreate] = Field(default_factory=list)
    areas: list[CapAreaCreate] = Field(default_factory=list)

    @field_validator("response_types")
    @classmethod
    def _response_types_are_cap_values(cls, values: list[str]) -> list[str]:
        allowed = [item.value for item in CapResponseType]
        bad = [value for value in values if value not in allowed]
        if bad:
            raise ValueError(
                f"responseType {', '.join(repr(value) for value in bad)} is not a CAP "
                f"response type. Use one or more of: {', '.join(allowed)}."
            )
        return values

    @field_validator("language")
    @classmethod
    def _language_is_a_language_tag(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*", value):
            raise ValueError(
                f"language {value!r} is not a language tag such as en or en-GD."
            )
        return value

    @field_validator("web")
    @classmethod
    def _web_is_one_address(cls, value: str | None) -> str | None:
        if value is not None and re.search(r"\s|[<>\"]", value):
            raise ValueError(
                "web must be one web address with no spaces, quotes or angle brackets."
            )
        return value


class CapInfoPublic(CapInfoBase):
    id: uuid.UUID
    sequence: int
    resources: list[CapResourcePublic] = Field(default_factory=list)
    areas: list[CapAreaPublic] = Field(default_factory=list)


class CapReferenceBase(BaseModel):
    sender: str = Field(min_length=1, max_length=255)
    identifier: str = Field(min_length=1, max_length=255)
    sent: UtcDateTime


class CapReferenceCreate(CapReferenceBase, CapTextInput):
    sent: Annotated[UtcDateTime, AwareDatetime()]


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
    def _validate_scope_and_references(self) -> CapAlertBase:
        if self.scope == CapScope.RESTRICTED and not self.restriction:
            raise ValueError("restriction is required when scope is Restricted")
        if self.scope == CapScope.PRIVATE and not self.addresses:
            raise ValueError("addresses are required when scope is Private")
        if self.msg_type != CapMessageType.ALERT and not self.references:
            raise ValueError(
                "references are required for Update, Cancel, Ack, and Error"
            )
        return self


class CapAlertCreate(CapAlertBase, CapTextInput):
    sent: Annotated[UtcDateTime, AwareDatetime()] | None = None


class CapAlertImportRequest(BaseModel):
    source: Literal["url", "xml"] = "xml"
    value: str = Field(min_length=1, max_length=MAX_IMPORT_CHARS)


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


class CapAlertUpdate(CapTextInput):
    identifier: str | None = Field(default=None, max_length=255)
    sender: str | None = Field(default=None, max_length=255)
    sent: Annotated[UtcDateTime, AwareDatetime()] | None = None
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
    # False for an imported alert that does not fully follow the CAP 1.2 schema.
    schema_conformant: bool = True
    schema_error: str | None = None
    # "feed" or "manual" for an imported alert; None for one authored here.
    import_source: str | None = None
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
    replaced_by_identifier: str | None = None
    cancellation_reason: str | None = None


class CapAlertListPublic(BaseModel):
    data: list[CapAlertPublic]
    count: int
    page: int = 1
    size: int = 100


class CapAlertPublicView(BaseModel):
    """An alert as the anonymous public sees it.

    Staff-only fields are left out: the schema check result, the imported marker,
    the internal note, and who created or last changed the alert.
    """

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
    lifecycle_state: CapLifecycleState
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
    replaced_by_identifier: str | None = None
    cancellation_reason: str | None = None


class CapAlertListPublicView(BaseModel):
    data: list[CapAlertPublicView]
    count: int
    page: int = 1
    size: int = 100


class CapAlertAction(CapTextInput):
    note: str | None = Field(default=None, max_length=2000)


class CapPublishAction(CapAlertAction):
    """Publish request. An imported alert needs ``confirm_imported`` (409 without it)."""

    confirm_imported: bool = False


class CapReviewRecord(BaseModel):
    """An optional colleague review (owner decision 2026-10-23); never blocks."""

    outcome: Literal["reviewed", "changes_requested"]
    note: str | None = Field(default=None, max_length=2000)


class CapEmergencyPublish(CapTextInput):
    reason: str = Field(min_length=1, max_length=2000)
    confirm_imported: bool = False


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
    wmo_oid: str | None = Field(
        default=None,
        max_length=120,
        description="WMO OID of the form 2.49.0.1.<country>.<authority>, digits and dots only. Empty clears it.",
    )
    web: str | None = Field(default=None, max_length=500)
    contact: str | None = Field(default=None, max_length=500)
    feed_limit: int | None = Field(default=None, ge=1, le=500)
    signing_enabled: bool | None = None
    signing_certificate_ref: str | None = Field(default=None, max_length=255)

    @field_validator("wmo_oid")
    @classmethod
    def _wmo_oid_form(cls, value: str | None) -> str | None:
        """WMO form 2.49.0.1.<country>.<authority>, digits and dots only. Empty clears it."""
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not WMO_OID.fullmatch(value):
            raise ValueError(
                "wmo_oid must be a WMO OID of the form 2.49.0.1.<country>.<authority>, "
                "digits and dots only, for example 2.49.0.1.308.1."
            )
        return value


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


class CapHazardGroupPublic(BaseModel):
    label: str
    categories: list[CapCategory]
    events: list[str]


class CapParishPublic(BaseModel):
    id: str
    iso_code: str
    name: str
    short_name: str


class CapProductRulePublic(BaseModel):
    key: str
    label: str
    needs_colour: bool


class CapColourRulePublic(BaseModel):
    key: str
    label: str
    awareness_code: int
    severity: CapSeverity


class CapCategoryLabelPublic(BaseModel):
    """One CAP category and the name the desk shows for it (a closed set)."""

    key: CapCategory
    label: str


class GmsCataloguePublic(BaseModel):
    """GMS warning catalogue: hazard list, parish geocodes, product and colour rules."""

    hazard_groups: list[CapHazardGroupPublic]
    category_labels: list[CapCategoryLabelPublic]
    parishes: list[CapParishPublic]
    products: list[CapProductRulePublic]
    colours: list[CapColourRulePublic]
    geocode_name: str


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


class PublicWarning(BaseModel):
    identifier: str
    event: str
    headline: str
    areas: list[str]
    expires: UtcDateTime | None
    severity: CapSeverity
    status: CapStatus
    # GMS product and impact colour (src/cap/levels.py); null for alerts that
    # predate the model or came from an imported feed.
    product: Literal["Outlook", "Watch", "Warning", "Advisory"] | None = None
    colour: Literal["green", "yellow", "orange", "red"] | None = None


class PublicWarningGroup(BaseModel):
    name: str
    alerts: list[PublicWarning]


class PublicWarnings(BaseModel):
    as_of: UtcDateTime
    groups: list[PublicWarningGroup]
    activeCount: int = Field(ge=0)


class CapEscalationCreate(BaseModel):
    """Raise a saved GMS alert revision to a CAP warning (ADR-0051)."""

    product_id: uuid.UUID
    revision: int = Field(ge=1, le=1_000_000)
    awareness_level: Literal["yellow", "orange", "red"]
    # Required when the colour differs from the matrix's suggestion for the saved
    # likelihood and impact (WMO impact-based matrix); recorded on the draft.
    override_reason: str | None = Field(default=None, max_length=1000)


class CapEscalationSource(BaseModel):
    product_id: uuid.UUID
    revision: int
    kind: str


class CapEscalationLookup(BaseModel):
    """The CAP warning raised from a GMS alert, if one is open or published."""

    alert_id: uuid.UUID | None = None
    lifecycle_state: CapLifecycleState | None = None


class CapEscalationPublic(BaseModel):
    alert_id: uuid.UUID
    created: bool
    source: CapEscalationSource
