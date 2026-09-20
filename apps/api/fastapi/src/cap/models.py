import uuid
from datetime import datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.orm import Base
from src.utils.datetime import utc_now


def column(
    *,
    default: Any = ...,
    default_factory: Any = None,
    primary_key: bool = False,
    foreign_key: str | None = None,
    index: bool = False,
    unique: bool = False,
    sa_column: Any = None,
    sa_type: Any = None,
    **_: Any,
) -> Any:
    """Build a SQLAlchemy column while retaining CAP's existing declarations."""
    if sa_column is not None:
        column_kwargs: dict[str, Any] = {
            "nullable": sa_column.nullable,
            "primary_key": primary_key,
            "index": index,
            "unique": unique,
        }
        if default_factory is not None:
            column_kwargs["default"] = default_factory
        elif default is not ...:
            column_kwargs["default"] = default
        return sa.Column(sa_column.type, **column_kwargs)
    args: list[Any] = []
    if sa_type is not None:
        args.append(sa_type)
    if foreign_key is not None:
        args.append(ForeignKey(foreign_key))
    kwargs: dict[str, Any] = {
        "primary_key": primary_key,
        "index": index,
        "unique": unique,
    }
    if default_factory is not None:
        kwargs["default"] = default_factory
    elif default is not ...:
        kwargs["default"] = default
    return mapped_column(*args, **kwargs)


def Relationship(*, back_populates: str) -> Any:
    return relationship(back_populates=back_populates)


class CapLifecycleState(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class CapStatus(str, Enum):
    ACTUAL = "Actual"
    EXERCISE = "Exercise"
    SYSTEM = "System"
    TEST = "Test"
    DRAFT = "Draft"


class CapMessageType(str, Enum):
    ALERT = "Alert"
    UPDATE = "Update"
    CANCEL = "Cancel"
    ACK = "Ack"
    ERROR = "Error"


class CapScope(str, Enum):
    PUBLIC = "Public"
    RESTRICTED = "Restricted"
    PRIVATE = "Private"


class CapCategory(str, Enum):
    GEO = "Geo"
    MET = "Met"
    SAFETY = "Safety"
    SECURITY = "Security"
    RESCUE = "Rescue"
    FIRE = "Fire"
    HEALTH = "Health"
    ENV = "Env"
    TRANSPORT = "Transport"
    INFRA = "Infra"
    CBRNE = "CBRNE"
    OTHER = "Other"


class CapResponseType(str, Enum):
    SHELTER = "Shelter"
    EVACUATE = "Evacuate"
    PREPARE = "Prepare"
    EXECUTE = "Execute"
    AVOID = "Avoid"
    MONITOR = "Monitor"
    ASSESS = "Assess"
    ALL_CLEAR = "AllClear"
    NONE = "None"


class CapUrgency(str, Enum):
    IMMEDIATE = "Immediate"
    EXPECTED = "Expected"
    FUTURE = "Future"
    PAST = "Past"
    UNKNOWN = "Unknown"


class CapSeverity(str, Enum):
    EXTREME = "Extreme"
    SEVERE = "Severe"
    MODERATE = "Moderate"
    MINOR = "Minor"
    UNKNOWN = "Unknown"


class CapCertainty(str, Enum):
    OBSERVED = "Observed"
    LIKELY = "Likely"
    POSSIBLE = "Possible"
    UNLIKELY = "Unlikely"
    UNKNOWN = "Unknown"


class CapAreaKind(str, Enum):
    AREA = "AREA"
    PREDEFINED = "PREDEFINED"
    POLYGON = "POLYGON"
    MULTIPOLYGON = "MULTIPOLYGON"
    CIRCLE = "CIRCLE"
    GEOCODE = "GEOCODE"


class CapIntegrationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    FAILED = "FAILED"


class CapJobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class CapAlert(Base):
    __tablename__ = "alert"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    identifier: Mapped[str] = column(unique=True, index=True, max_length=255)
    sender: Mapped[str] = column(index=True, max_length=255)
    sent: Mapped[datetime] = column(default_factory=utc_now, index=True)
    status: Mapped[CapStatus] = column(default=CapStatus.DRAFT)
    msg_type: Mapped[CapMessageType] = column(default=CapMessageType.ALERT)
    source: Mapped[str | None] = column(default=None, max_length=255)
    scope: Mapped[CapScope] = column(default=CapScope.PUBLIC)
    restriction: Mapped[str | None] = column(default=None, max_length=500)
    addresses: Mapped[list[str]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    codes: Mapped[list[str]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    note: Mapped[str | None] = column(default=None, max_length=2000)
    lifecycle_state: Mapped[CapLifecycleState] = column(
        default=CapLifecycleState.DRAFT, index=True
    )
    allow_self_approval: Mapped[bool] = column(default=True)
    created_by_user_id: Mapped[uuid.UUID] = column(foreign_key="user.id", index=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="user.id"
    )
    submitted_at: Mapped[datetime | None] = column(default=None)
    approved_at: Mapped[datetime | None] = column(default=None)
    published_at: Mapped[datetime | None] = column(default=None)
    expired_at: Mapped[datetime | None] = column(default=None)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)

    # Relationships (Python-only, no schema change)
    info_blocks: Mapped[list[CapInfo]] = Relationship(back_populates="alert")
    cap_references: Mapped[list[CapReference]] = Relationship(back_populates="alert")
    incidents: Mapped[list[CapIncident]] = Relationship(back_populates="alert")


class CapInfo(Base):
    __tablename__ = "info"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: Mapped[int] = column(default=0, ge=0)
    language: Mapped[str] = column(default="en", max_length=35)
    categories: Mapped[list[str]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    event: Mapped[str] = column(max_length=255)
    event_codes: Mapped[list[dict[str, str]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    response_types: Mapped[list[str]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    urgency: Mapped[CapUrgency] = column()
    severity: Mapped[CapSeverity] = column()
    certainty: Mapped[CapCertainty] = column()
    audience: Mapped[str | None] = column(default=None, max_length=500)
    effective: Mapped[datetime | None] = column(default=None)
    onset: Mapped[datetime | None] = column(default=None)
    expires: Mapped[datetime | None] = column(default=None, index=True)
    sender_name: Mapped[str | None] = column(default=None, max_length=255)
    headline: Mapped[str] = column(max_length=255)
    description: Mapped[str] = column(max_length=4000)
    instruction: Mapped[str | None] = column(default=None, max_length=4000)
    web: Mapped[str | None] = column(default=None, max_length=500)
    contact: Mapped[str | None] = column(default=None, max_length=500)
    parameters: Mapped[list[dict[str, str]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)

    alert: Mapped[CapAlert] = Relationship(back_populates="info_blocks")
    resources: Mapped[list[CapResource]] = Relationship(back_populates="info")
    areas: Mapped[list[CapArea]] = Relationship(back_populates="info")


class CapArea(Base):
    __tablename__ = "area"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    info_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.info.id", index=True, ondelete="CASCADE"
    )
    predefined_area_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="cap.predefined_area.id"
    )
    sequence: Mapped[int] = column(default=0, ge=0)
    kind: Mapped[CapAreaKind] = column(default=CapAreaKind.AREA)
    area_desc: Mapped[str] = column(max_length=1000)
    polygons: Mapped[list[list[list[float]]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    multipolygons: Mapped[list[list[list[list[float]]]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    circles: Mapped[list[dict[str, float]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geocodes: Mapped[list[dict[str, str]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geometry: Mapped[dict[str, object] | None] = column(
        default=None, sa_column=sa.Column(sa.JSON)
    )
    altitude: Mapped[float | None] = column(default=None)
    ceiling: Mapped[float | None] = column(default=None)

    info: Mapped[CapInfo] = Relationship(back_populates="areas")


class CapResource(Base):
    __tablename__ = "resource"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    info_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.info.id", index=True, ondelete="CASCADE"
    )
    sequence: Mapped[int] = column(default=0, ge=0)
    resource_desc: Mapped[str] = column(max_length=255)
    mime_type: Mapped[str] = column(max_length=120)
    size: Mapped[int | None] = column(default=None, ge=0)
    uri: Mapped[str | None] = column(default=None, max_length=1000)
    deref_uri: Mapped[str | None] = column(default=None, sa_type=sa.Text)
    digest: Mapped[str | None] = column(default=None, max_length=255)

    info: Mapped[CapInfo] = Relationship(back_populates="resources")


class CapReference(Base):
    __tablename__ = "reference"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: Mapped[int] = column(default=0, ge=0)
    sender: Mapped[str] = column(max_length=255)
    identifier: Mapped[str] = column(max_length=255)
    sent: Mapped[datetime] = column()

    alert: Mapped[CapAlert] = Relationship(back_populates="cap_references")


class CapIncident(Base):
    __tablename__ = "incident"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: Mapped[int] = column(default=0, ge=0)
    value: Mapped[str] = column(max_length=255)

    alert: Mapped[CapAlert] = Relationship(back_populates="incidents")


class CapSnapshot(Base):
    __tablename__ = "snapshot"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID] = column(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    identifier: Mapped[str] = column(index=True, max_length=255)
    xml: Mapped[str] = column(sa_type=sa.Text)
    content_hash: Mapped[str] = column(max_length=64, index=True)
    generated_at: Mapped[datetime] = column(default_factory=utc_now, index=True)
    signed_at: Mapped[datetime | None] = column(default=None)
    signing_key_ref: Mapped[str | None] = column(default=None, max_length=255)


class CapSettings(Base):
    __tablename__ = "settings"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    sender: Mapped[str] = column(default="cap@weather.gd", max_length=255)
    sender_name: Mapped[str] = column(
        default="Grenada Meteorological Service", max_length=255
    )
    wmo_oid: Mapped[str | None] = column(default=None, max_length=120)
    web: Mapped[str | None] = column(default=None, max_length=500)
    contact: Mapped[str | None] = column(default=None, max_length=500)
    feed_limit: Mapped[int] = column(default=100, ge=1, le=500)
    signing_enabled: Mapped[bool] = column(default=False)
    signing_certificate_ref: Mapped[str | None] = column(default=None, max_length=255)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapHazardType(Base):
    __tablename__ = "hazard_type"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    code: Mapped[str] = column(unique=True, max_length=120)
    label: Mapped[str] = column(max_length=255)
    category: Mapped[CapCategory] = column(default=CapCategory.MET)
    default_urgency: Mapped[CapUrgency] = column(default=CapUrgency.EXPECTED)
    default_severity: Mapped[CapSeverity] = column(default=CapSeverity.MODERATE)
    default_certainty: Mapped[CapCertainty] = column(default=CapCertainty.LIKELY)
    is_active: Mapped[bool] = column(default=True)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapPredefinedArea(Base):
    __tablename__ = "predefined_area"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    name: Mapped[str] = column(unique=True, max_length=255)
    area_desc: Mapped[str] = column(max_length=1000)
    geometry: Mapped[dict[str, object] | None] = column(
        default=None, sa_column=sa.Column(sa.JSON)
    )
    polygons: Mapped[list[list[list[float]]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    multipolygons: Mapped[list[list[list[list[float]]]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    circles: Mapped[list[dict[str, float]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geocodes: Mapped[list[dict[str, str]]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    is_active: Mapped[bool] = column(default=True)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapWebhook(Base):
    __tablename__ = "webhook"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    name: Mapped[str] = column(max_length=255)
    url: Mapped[str] = column(max_length=1000)
    secret_ref: Mapped[str | None] = column(default=None, max_length=255)
    event_types: Mapped[list[str]] = column(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    status: Mapped[CapIntegrationStatus] = column(default=CapIntegrationStatus.ACTIVE)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapMqttBroker(Base):
    __tablename__ = "mqtt_broker"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    name: Mapped[str] = column(max_length=255)
    host: Mapped[str] = column(max_length=255)
    port: Mapped[int] = column(default=1883, ge=1, le=65535)
    topic: Mapped[str] = column(max_length=255)
    username: Mapped[str | None] = column(default=None, max_length=255)
    password_ref: Mapped[str | None] = column(default=None, max_length=255)
    status: Mapped[CapIntegrationStatus] = column(default=CapIntegrationStatus.ACTIVE)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapFeedImport(Base):
    __tablename__ = "feed_import"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    name: Mapped[str] = column(max_length=255)
    url: Mapped[str] = column(max_length=1000)
    status: Mapped[CapIntegrationStatus] = column(default=CapIntegrationStatus.ACTIVE)
    last_checked_at: Mapped[datetime | None] = column(default=None)
    last_error: Mapped[str | None] = column(default=None, max_length=2000)
    last_etag: Mapped[str | None] = column(default=None, max_length=255)
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapJobEvent(Base):
    __tablename__ = "job_event"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="cap.alert.id"
    )
    snapshot_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="cap.snapshot.id"
    )
    kind: Mapped[str] = column(max_length=120)
    status: Mapped[CapJobStatus] = column(default=CapJobStatus.QUEUED, index=True)
    attempts: Mapped[int] = column(default=0, ge=0)
    # Earliest time a FAILED job may be retried. NULL means "eligible now"
    # (never-failed QUEUED jobs). Set to an exponential-backoff future time on
    # failure so process_due_jobs paces retries instead of hammering every poll.
    next_retry_at: Mapped[datetime | None] = column(default=None)
    payload: Mapped[dict[str, object]] = column(
        default_factory=dict, sa_column=sa.Column(sa.JSON)
    )
    result: Mapped[dict[str, object] | None] = column(
        default=None, sa_column=sa.Column(sa.JSON)
    )
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    updated_at: Mapped[datetime] = column(default_factory=utc_now)


class CapAuditEvent(Base):
    __tablename__ = "audit_event"
    __table_args__ = {"schema": "cap"}

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    alert_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="cap.alert.id"
    )
    actor_user_id: Mapped[uuid.UUID | None] = column(
        default=None, foreign_key="user.id"
    )
    action: Mapped[str] = column(max_length=120, index=True)
    previous_state: Mapped[str | None] = column(default=None, max_length=80)
    next_state: Mapped[str | None] = column(default=None, max_length=80)
    note: Mapped[str | None] = column(default=None, max_length=2000)
    payload: Mapped[dict[str, object]] = column(
        default_factory=dict, sa_column=sa.Column(sa.JSON)
    )
    created_at: Mapped[datetime] = column(default_factory=utc_now, index=True)


class CapHazardProfile(Base):
    __tablename__ = "hazard_profile"
    __table_args__ = (
        sa.UniqueConstraint("key", "version", name="uq_cap_profile_version"),
        {"schema": "cap"},
    )

    id: Mapped[uuid.UUID] = column(default_factory=uuid.uuid4, primary_key=True)
    key: Mapped[str] = column(max_length=100, index=True)
    version: Mapped[int] = column()
    definition: Mapped[dict[str, object]] = column(
        sa_column=sa.Column(sa.JSON, nullable=False)
    )
    state: Mapped[str] = column(default="DRAFT", max_length=20)
    created_by: Mapped[uuid.UUID] = column()
    created_at: Mapped[datetime] = column(default_factory=utc_now)
    approved_by: Mapped[uuid.UUID | None] = column(default=None)
    approved_at: Mapped[datetime | None] = column(default=None)
