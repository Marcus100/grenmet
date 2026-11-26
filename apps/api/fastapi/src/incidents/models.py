"""Incident tables (ADR-0067, main database, ``incidents`` schema).

``category`` decides the responsible manager and the checklist an incident gets;
``checklist_item`` is a category's template line. ``incident`` is one occurrence,
draft to open to closed; closing locks it. ``incident_check`` is a copy of the
category's checklist taken when the incident opens, so later template edits never
rewrite a past response. ``timeline_entry`` (time-stamped response actions) and
``note`` rows are only ever inserted. ``counter`` issues the yearly reference
number per organisation. User ids carry no foreign key. Datetimes are naive UTC.
"""

import secrets
import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

SCHEMA = "incidents"


class IncidentStatus(str, Enum):
    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"


class IncidentTimelineKind(str, Enum):
    """``action`` is written by a responder; the others record a status change."""

    ACTION = "action"
    OPENED = "opened"
    CLOSED = "closed"
    REOPENED = "reopened"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


def new_category_id() -> str:
    return f"icc_{secrets.token_hex(8)}"


def new_checklist_item_id() -> str:
    return f"ici_{secrets.token_hex(8)}"


def new_incident_id() -> str:
    return f"inc_{secrets.token_hex(8)}"


def new_check_id() -> str:
    return f"ick_{secrets.token_hex(8)}"


def new_timeline_id() -> str:
    return f"itl_{secrets.token_hex(8)}"


def new_note_id() -> str:
    return f"inn_{secrets.token_hex(8)}"


class IncidentCategory(Base):
    __tablename__ = "category"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "name", name="category_organisation_name"
        ),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_category_id
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(500))
    #: The member who answers for incidents of this category (an active member).
    manager_user_id: Mapped[uuid.UUID | None]
    archived_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class IncidentChecklistItem(Base):
    """One line of a category's checklist template."""

    __tablename__ = "checklist_item"
    __table_args__ = (
        sa.CheckConstraint("char_length(label) BETWEEN 1 AND 200", name="label"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_checklist_item_id
    )
    category_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.category.id", ondelete="CASCADE"),
        index=True,
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(200))
    required: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(default=0)
    archived_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class IncidentCounter(Base):
    """Last reference number issued to an organisation in a year."""

    __tablename__ = "counter"
    __table_args__ = {"schema": SCHEMA}

    organisation_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("org.organisation.id", ondelete="CASCADE"),
        primary_key=True,
    )
    year: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    last_number: Mapped[int] = mapped_column(default=0)


class Incident(Base):
    __tablename__ = "incident"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "reference", name="incident_organisation_reference"
        ),
        sa.CheckConstraint(f"status IN ({_values(IncidentStatus)})", name="status"),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title"),
        sa.CheckConstraint(
            "(status = 'closed') = (closed_at IS NOT NULL)", name="closed_state"
        ),
        sa.Index("incident_organisation_created_idx", "organisation_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_incident_id
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    #: ``INC-2026-0001``, unique per organisation, issued when the draft is made.
    reference: Mapped[str] = mapped_column(String(20))
    category_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.category.id", ondelete="SET NULL"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    occurred_at: Mapped[datetime]
    #: A training exercise uses the same forms and is reported apart.
    exercise: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(10), default=IncidentStatus.DRAFT.value)
    reported_by: Mapped[uuid.UUID]
    opened_at: Mapped[datetime | None]
    closed_at: Mapped[datetime | None]
    closed_by: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class IncidentCheck(Base):
    """A checklist line of one incident, copied from the template at opening."""

    __tablename__ = "incident_check"
    __table_args__ = (
        sa.CheckConstraint("char_length(label) BETWEEN 1 AND 200", name="label"),
        sa.CheckConstraint("(done_at IS NULL) = (done_by IS NULL)", name="done_pair"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_check_id)
    incident_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.incident.id", ondelete="CASCADE"),
        index=True,
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(200))
    required: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(default=0)
    done_at: Mapped[datetime | None]
    done_by: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class IncidentTimelineEntry(Base):
    """One time-stamped response action or status change. Insert only."""

    __tablename__ = "timeline_entry"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(IncidentTimelineKind)})", name="kind"),
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 2000", name="text"),
        sa.Index("timeline_entry_incident_at_idx", "incident_id", "occurred_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_timeline_id
    )
    incident_id: Mapped[str] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.incident.id", ondelete="CASCADE")
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    #: When the action happened (a responder may record it afterwards).
    occurred_at: Mapped[datetime]
    author_id: Mapped[uuid.UUID]
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class IncidentNote(Base):
    """Detail, correspondence or a finding. Insert only; private needs a key."""

    __tablename__ = "note"
    __table_args__ = (
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 5000", name="text"),
        sa.Index("note_incident_created_idx", "incident_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_note_id)
    incident_id: Mapped[str] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.incident.id", ondelete="CASCADE")
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID]
    text: Mapped[str] = mapped_column(Text)
    private: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


def new_attachment_id() -> str:
    return f"ina_{secrets.token_hex(8)}"


class IncidentAttachment(Base):
    """A photo added to an incident: the storage upload id only (purpose
    ``incident-photo``). Rows are only ever inserted."""

    __tablename__ = "attachment"
    __table_args__ = (
        sa.UniqueConstraint("incident_id", "file_id", name="attachment_incident_file"),
        sa.CheckConstraint(
            "caption IS NULL OR char_length(caption) BETWEEN 1 AND 200",
            name="caption",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_attachment_id
    )
    incident_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.incident.id", ondelete="CASCADE"),
        index=True,
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    file_id: Mapped[uuid.UUID]
    caption: Mapped[str | None] = mapped_column(String(200))
    added_by: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
