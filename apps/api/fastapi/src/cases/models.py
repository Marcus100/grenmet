"""Case engine tables (ADR-0069, main database, ``cases`` schema).

One engine serves several programmes (safety first; aviation security,
occupational health and environmental management later). Every table carries
``organisation_id`` and ``programme``, and child tables point at their case with
a composite key on all three, so a row can never join a case of another
organisation or programme. ``programme`` is text with a check, not a Postgres
enum. User ids carry no foreign key. Datetimes are naive UTC.
"""

import secrets
import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

SCHEMA = "cases"


class Programme(str, Enum):
    SAFETY = "safety"
    AVIATION_SECURITY = "aviation_security"
    OCCUPATIONAL_HEALTH = "occupational_health"
    ENVIRONMENTAL_MANAGEMENT = "environmental_management"


class CaseStatus(str, Enum):
    REPORTED = "reported"
    ASSESSING = "assessing"
    INVESTIGATING = "investigating"
    ACTIONS = "actions"
    MONITORING = "monitoring"
    CLOSED = "closed"


class CaseRiskKind(str, Enum):
    """``initial`` is before controls; ``residual`` is after them."""

    INITIAL = "initial"
    RESIDUAL = "residual"


class CaseRiskBand(str, Enum):
    """What a cell of the grid means (ICAO Doc 9859). The order is fixed; an
    organisation chooses which cells fall in which band, never what a band means."""

    ACCEPTABLE = "acceptable"
    TOLERABLE = "tolerable"
    INTOLERABLE = "intolerable"


class CaseActionStatus(str, Enum):
    OPEN = "open"
    DONE = "done"
    VERIFIED = "verified"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


_PROGRAMME_CHECK = f"programme IN ({_values(Programme)})"


def new_case_id() -> str:
    return f"cas_{secrets.token_hex(8)}"


def new_assessment_id() -> str:
    return f"car_{secrets.token_hex(8)}"


def new_action_id() -> str:
    return f"caa_{secrets.token_hex(8)}"


class CaseRiskGrid(Base):
    """An organisation's own risk grid for a programme. No row means the ICAO
    Doc 9859 example grid (``risk.default_grid``)."""

    __tablename__ = "risk_grid"
    __table_args__ = (
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        {"schema": SCHEMA},
    )

    organisation_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("org.organisation.id", ondelete="CASCADE"),
        primary_key=True,
    )
    programme: Mapped[str] = mapped_column(String(30), primary_key=True)
    #: ``[{"value": 5, "label": "Frequent"}, ...]``, highest first.
    likelihoods: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    #: ``[{"code": "A", "label": "Catastrophic"}, ...]``, worst first.
    severities: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    #: ``{"5A": "intolerable", ...}``: one band for every likelihood and severity.
    cells: Mapped[dict[str, str]] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID]
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class CaseCounter(Base):
    """Last reference number issued per organisation, programme and year."""

    __tablename__ = "counter"
    __table_args__ = (
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        {"schema": SCHEMA},
    )

    organisation_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("org.organisation.id", ondelete="CASCADE"),
        primary_key=True,
    )
    programme: Mapped[str] = mapped_column(String(30), primary_key=True)
    year: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    last_number: Mapped[int] = mapped_column(default=0)


class Case(Base):
    __tablename__ = "case"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "programme", "reference", name="case_reference"
        ),
        # The target of the children's composite foreign key.
        sa.UniqueConstraint(
            "id", "organisation_id", "programme", name="case_id_organisation_programme"
        ),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        sa.CheckConstraint(f"status IN ({_values(CaseStatus)})", name="status"),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title"),
        sa.CheckConstraint(
            "(status = 'closed') = (closed_at IS NOT NULL)", name="closed_state"
        ),
        sa.CheckConstraint(
            "(source_kind IS NULL) = (source_id IS NULL)", name="source_ref"
        ),
        sa.Index(
            "case_organisation_programme_created_idx",
            "organisation_id",
            "programme",
            "created_at",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_case_id)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    programme: Mapped[str] = mapped_column(String(30))
    #: ``SAF-2026-0001``: the programme's prefix, the year and a running number.
    reference: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    occurred_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(15), default=CaseStatus.REPORTED.value)
    #: The record the case came from, as ``(kind, id)`` (ADR-0067), for example an
    #: incident. Several cases may name one record, and a case names at most one.
    source_kind: Mapped[str | None] = mapped_column(String(60))
    source_id: Mapped[str | None] = mapped_column(String(100))
    reported_by: Mapped[uuid.UUID]
    closed_at: Mapped[datetime | None]
    closed_by: Mapped[uuid.UUID | None]
    #: True when the case closed because no hazard was found (ADR-0069 decision 4).
    closed_no_risk: Mapped[bool] = mapped_column(default=False)
    close_reason: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


def _case_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["case_id", "organisation_id", "programme"],
        [
            f"{SCHEMA}.case.id",
            f"{SCHEMA}.case.organisation_id",
            f"{SCHEMA}.case.programme",
        ],
        name=f"{table}_case_fkey",
        ondelete="CASCADE",
    )


class CaseRiskAssessment(Base):
    """One assessment against the grid as it stood. The labels and the band are
    copied in, so editing the grid later never rewrites it. Insert only, except
    the acceptance stamp."""

    __tablename__ = "risk_assessment"
    __table_args__ = (
        _case_fk("risk_assessment"),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        sa.CheckConstraint(f"kind IN ({_values(CaseRiskKind)})", name="kind"),
        sa.CheckConstraint(f"band IN ({_values(CaseRiskBand)})", name="band"),
        sa.CheckConstraint(
            "(accepted_at IS NULL) = (accepted_by IS NULL)", name="accepted_pair"
        ),
        # Doc 9859: only a tolerable risk can be accepted.
        sa.CheckConstraint(
            "accepted_at IS NULL OR band = 'tolerable'", name="accept_tolerable_only"
        ),
        sa.Index("risk_assessment_case_created_idx", "case_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_assessment_id
    )
    case_id: Mapped[str] = mapped_column(String(100))
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    programme: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(10))
    likelihood: Mapped[int] = mapped_column(sa.SmallInteger)
    likelihood_label: Mapped[str] = mapped_column(String(60))
    severity: Mapped[str] = mapped_column(String(2))
    severity_label: Mapped[str] = mapped_column(String(60))
    band: Mapped[str] = mapped_column(String(12))
    rationale: Mapped[str | None] = mapped_column(Text)
    assessed_by: Mapped[uuid.UUID]
    accepted_by: Mapped[uuid.UUID | None]
    accepted_at: Mapped[datetime | None]
    acceptance_note: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class CaseAction(Base):
    """A corrective action: an owner, a due date and its own short lifecycle."""

    __tablename__ = "action"
    __table_args__ = (
        _case_fk("action"),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        sa.CheckConstraint(f"status IN ({_values(CaseActionStatus)})", name="status"),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title"),
        sa.CheckConstraint(
            "(status = 'verified') = (verified_at IS NOT NULL)", name="verified_state"
        ),
        sa.Index("action_case_idx", "case_id"),
        sa.Index("action_owner_status_idx", "owner_user_id", "status"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_action_id
    )
    case_id: Mapped[str] = mapped_column(String(100))
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    programme: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    owner_user_id: Mapped[uuid.UUID]
    due_date: Mapped[date]
    status: Mapped[str] = mapped_column(String(10), default=CaseActionStatus.OPEN.value)
    progress_note: Mapped[str | None] = mapped_column(String(2000))
    done_at: Mapped[datetime | None]
    verified_by: Mapped[uuid.UUID | None]
    verified_at: Mapped[datetime | None]
    created_by: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
