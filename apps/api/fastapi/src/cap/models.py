import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, Relationship, SQLModel

from src.utils.datetime import utc_now


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


class CapAlert(SQLModel, table=True):
    __tablename__ = "alert"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    identifier: str = Field(unique=True, index=True, max_length=255)
    sender: str = Field(index=True, max_length=255)
    sent: datetime = Field(default_factory=utc_now, index=True)
    status: CapStatus = Field(default=CapStatus.DRAFT)
    msg_type: CapMessageType = Field(default=CapMessageType.ALERT)
    source: str | None = Field(default=None, max_length=255)
    scope: CapScope = Field(default=CapScope.PUBLIC)
    restriction: str | None = Field(default=None, max_length=500)
    addresses: list[str] = Field(default_factory=list, sa_column=sa.Column(sa.JSON))
    codes: list[str] = Field(default_factory=list, sa_column=sa.Column(sa.JSON))
    note: str | None = Field(default=None, max_length=2000)
    lifecycle_state: CapLifecycleState = Field(
        default=CapLifecycleState.DRAFT, index=True
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    updated_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    submitted_at: datetime | None = Field(default=None)
    approved_at: datetime | None = Field(default=None)
    published_at: datetime | None = Field(default=None)
    expired_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    # Relationships (Python-only, no schema change)
    info_blocks: list["CapInfo"] = Relationship(back_populates="alert")
    cap_references: list["CapReference"] = Relationship(back_populates="alert")
    incidents: list["CapIncident"] = Relationship(back_populates="alert")


class CapInfo(SQLModel, table=True):
    __tablename__ = "info"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID = Field(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: int = Field(default=0, ge=0)
    language: str = Field(default="en", max_length=35)
    categories: list[str] = Field(default_factory=list, sa_column=sa.Column(sa.JSON))
    event: str = Field(max_length=255)
    event_codes: list[dict[str, str]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    response_types: list[str] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    urgency: CapUrgency
    severity: CapSeverity
    certainty: CapCertainty
    audience: str | None = Field(default=None, max_length=500)
    effective: datetime | None = Field(default=None)
    onset: datetime | None = Field(default=None)
    expires: datetime | None = Field(default=None, index=True)
    sender_name: str | None = Field(default=None, max_length=255)
    headline: str = Field(max_length=255)
    description: str = Field(max_length=4000)
    instruction: str | None = Field(default=None, max_length=4000)
    web: str | None = Field(default=None, max_length=500)
    contact: str | None = Field(default=None, max_length=500)
    parameters: list[dict[str, str]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    alert: "CapAlert" = Relationship(back_populates="info_blocks")
    resources: list["CapResource"] = Relationship(back_populates="info")
    areas: list["CapArea"] = Relationship(back_populates="info")


class CapArea(SQLModel, table=True):
    __tablename__ = "area"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    info_id: uuid.UUID = Field(
        foreign_key="cap.info.id", index=True, ondelete="CASCADE"
    )
    predefined_area_id: uuid.UUID | None = Field(
        default=None, foreign_key="cap.predefined_area.id"
    )
    sequence: int = Field(default=0, ge=0)
    kind: CapAreaKind = Field(default=CapAreaKind.AREA)
    area_desc: str = Field(max_length=1000)
    polygons: list[list[list[float]]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    multipolygons: list[list[list[list[float]]]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    circles: list[dict[str, float]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geocodes: list[dict[str, str]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geometry: dict[str, object] | None = Field(
        default=None, sa_column=sa.Column(sa.JSON)
    )
    altitude: float | None = Field(default=None)
    ceiling: float | None = Field(default=None)

    info: "CapInfo" = Relationship(back_populates="areas")


class CapResource(SQLModel, table=True):
    __tablename__ = "resource"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    info_id: uuid.UUID = Field(
        foreign_key="cap.info.id", index=True, ondelete="CASCADE"
    )
    sequence: int = Field(default=0, ge=0)
    resource_desc: str = Field(max_length=255)
    mime_type: str = Field(max_length=120)
    size: int | None = Field(default=None, ge=0)
    uri: str | None = Field(default=None, max_length=1000)
    deref_uri: str | None = Field(default=None, sa_type=sa.Text)
    digest: str | None = Field(default=None, max_length=255)

    info: "CapInfo" = Relationship(back_populates="resources")


class CapReference(SQLModel, table=True):
    __tablename__ = "reference"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID = Field(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: int = Field(default=0, ge=0)
    sender: str = Field(max_length=255)
    identifier: str = Field(max_length=255)
    sent: datetime

    alert: "CapAlert" = Relationship(back_populates="cap_references")


class CapIncident(SQLModel, table=True):
    __tablename__ = "incident"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID = Field(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    sequence: int = Field(default=0, ge=0)
    value: str = Field(max_length=255)

    alert: "CapAlert" = Relationship(back_populates="incidents")


class CapSnapshot(SQLModel, table=True):
    __tablename__ = "snapshot"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID = Field(
        foreign_key="cap.alert.id", index=True, ondelete="CASCADE"
    )
    identifier: str = Field(index=True, max_length=255)
    xml: str = Field(sa_type=sa.Text)
    content_hash: str = Field(max_length=64, index=True)
    generated_at: datetime = Field(default_factory=utc_now, index=True)
    signed_at: datetime | None = Field(default=None)
    signing_key_ref: str | None = Field(default=None, max_length=255)


class CapSettings(SQLModel, table=True):
    __tablename__ = "settings"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    sender: str = Field(default="cap@weather.gd", max_length=255)
    sender_name: str = Field(default="Grenada Meteorological Service", max_length=255)
    wmo_oid: str | None = Field(default=None, max_length=120)
    web: str | None = Field(default=None, max_length=500)
    contact: str | None = Field(default=None, max_length=500)
    feed_limit: int = Field(default=100, ge=1, le=500)
    signing_enabled: bool = False
    signing_certificate_ref: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapHazardType(SQLModel, table=True):
    __tablename__ = "hazard_type"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, max_length=120)
    label: str = Field(max_length=255)
    category: CapCategory = Field(default=CapCategory.MET)
    default_urgency: CapUrgency = Field(default=CapUrgency.EXPECTED)
    default_severity: CapSeverity = Field(default=CapSeverity.MODERATE)
    default_certainty: CapCertainty = Field(default=CapCertainty.LIKELY)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapPredefinedArea(SQLModel, table=True):
    __tablename__ = "predefined_area"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=255)
    area_desc: str = Field(max_length=1000)
    geometry: dict[str, object] | None = Field(
        default=None, sa_column=sa.Column(sa.JSON)
    )
    polygons: list[list[list[float]]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    multipolygons: list[list[list[list[float]]]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    circles: list[dict[str, float]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    geocodes: list[dict[str, str]] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapWebhook(SQLModel, table=True):
    __tablename__ = "webhook"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    url: str = Field(max_length=1000)
    secret_ref: str | None = Field(default=None, max_length=255)
    event_types: list[str] = Field(default_factory=list, sa_column=sa.Column(sa.JSON))
    status: CapIntegrationStatus = Field(default=CapIntegrationStatus.ACTIVE)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapMqttBroker(SQLModel, table=True):
    __tablename__ = "mqtt_broker"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    host: str = Field(max_length=255)
    port: int = Field(default=1883, ge=1, le=65535)
    topic: str = Field(max_length=255)
    username: str | None = Field(default=None, max_length=255)
    password_ref: str | None = Field(default=None, max_length=255)
    status: CapIntegrationStatus = Field(default=CapIntegrationStatus.ACTIVE)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapFeedImport(SQLModel, table=True):
    __tablename__ = "feed_import"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    url: str = Field(max_length=1000)
    status: CapIntegrationStatus = Field(default=CapIntegrationStatus.ACTIVE)
    last_checked_at: datetime | None = Field(default=None)
    last_error: str | None = Field(default=None, max_length=2000)
    last_etag: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapJobEvent(SQLModel, table=True):
    __tablename__ = "job_event"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID | None = Field(default=None, foreign_key="cap.alert.id")
    snapshot_id: uuid.UUID | None = Field(default=None, foreign_key="cap.snapshot.id")
    kind: str = Field(max_length=120)
    status: CapJobStatus = Field(default=CapJobStatus.QUEUED, index=True)
    attempts: int = Field(default=0, ge=0)
    payload: dict[str, object] = Field(
        default_factory=dict, sa_column=sa.Column(sa.JSON)
    )
    result: dict[str, object] | None = Field(default=None, sa_column=sa.Column(sa.JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CapAuditEvent(SQLModel, table=True):
    __tablename__ = "audit_event"
    __table_args__ = {"schema": "cap"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    alert_id: uuid.UUID | None = Field(default=None, foreign_key="cap.alert.id")
    actor_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    action: str = Field(max_length=120, index=True)
    previous_state: str | None = Field(default=None, max_length=80)
    next_state: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=2000)
    payload: dict[str, object] = Field(
        default_factory=dict, sa_column=sa.Column(sa.JSON)
    )
    created_at: datetime = Field(default_factory=utc_now, index=True)
