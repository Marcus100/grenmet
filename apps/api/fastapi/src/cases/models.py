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


class InvestigationStatus(str, Enum):
    """``not_needed`` is a recorded decision (with a reason) that no investigation
    is required; it lets a case move on to actions like an approved one does."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    NOT_NEEDED = "not_needed"


class FactorCategory(str, Enum):
    """Categories of contributing factor, after ICAO Doc 9859 and the SHELL model."""

    HUMAN_FACTORS = "human_factors"
    PROCEDURES = "procedures"
    EQUIPMENT = "equipment"
    ENVIRONMENT = "environment"
    ORGANISATION = "organisation"
    TRAINING = "training"
    COMMUNICATION = "communication"
    SUPERVISION = "supervision"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


_PROGRAMME_CHECK = f"programme IN ({_values(Programme)})"


def new_case_id() -> str:
    return f"cas_{secrets.token_hex(8)}"


def new_assessment_id() -> str:
    return f"car_{secrets.token_hex(8)}"


def new_action_id() -> str:
    return f"caa_{secrets.token_hex(8)}"


def new_investigation_id() -> str:
    return f"civ_{secrets.token_hex(8)}"


#: A factor id as ``new_factor_id`` issues it: ``cfa_`` and 16 hex characters. The router
#: declares the same shape on its path parameter; ``service.require_factor_id_shape``
#: checks it on the investigation's factor ids, and a test pins the two together.
FACTOR_ID_PATTERN = r"^cfa_[0-9a-f]{16}$"


def new_factor_id() -> str:
    return f"cfa_{secrets.token_hex(8)}"


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
    #: When the case was last reopened. A residual assessment made before this
    #: no longer counts for closing: the risk must be assessed again.
    reopened_at: Mapped[datetime | None]
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
        sa.CheckConstraint(
            "(verified_at IS NULL) = (verified_by IS NULL)", name="verified_pair"
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


class ContributingFactor(Base):
    """One entry on an organisation's list of contributing factors for a programme.
    Retired entries stay (``is_active`` false) so that old investigations keep
    their meaning; only active entries can be chosen."""

    __tablename__ = "contributing_factor"
    __table_args__ = (
        # Names are unique per programme, ignoring case.
        sa.Index(
            "contributing_factor_name",
            "organisation_id",
            "programme",
            sa.text("lower(name)"),
            unique=True,
        ),
        # The target of the investigation's composite foreign key.
        sa.UniqueConstraint(
            "id",
            "organisation_id",
            "programme",
            name="contributing_factor_id_organisation_programme",
        ),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        sa.CheckConstraint(f"category IN ({_values(FactorCategory)})", name="category"),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="name"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_factor_id
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    programme: Mapped[str] = mapped_column(String(30))
    category: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(default=True)
    #: Null for a starting-list entry written by the system.
    created_by: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class FactorSeed(Base):
    """Marks that an organisation's programme has its starting factor list. Written
    on a write path only, so a read never writes."""

    __tablename__ = "factor_seed"
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
    seeded_at: Mapped[datetime] = mapped_column(default=utc_now)


class CaseInvestigation(Base):
    """The investigation of a case: one per case (ADR-0069 decision 5). Text is
    audited as sensitive. Editable only while draft; an approved or not-needed
    investigation is read-only until the case is reopened, which returns it to
    draft."""

    __tablename__ = "investigation"
    __table_args__ = (
        _case_fk("investigation"),
        sa.UniqueConstraint("case_id", name="investigation_case"),
        sa.UniqueConstraint(
            "id",
            "organisation_id",
            "programme",
            name="investigation_id_organisation_programme",
        ),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        sa.CheckConstraint(
            f"status IN ({_values(InvestigationStatus)})", name="status"
        ),
        # Approved and not-needed are the only decided states.
        sa.CheckConstraint(
            "(decided_at IS NOT NULL) = (status IN ('approved', 'not_needed'))",
            name="decided_state",
        ),
        sa.CheckConstraint(
            "(decided_at IS NULL) = (decided_by IS NULL)", name="decided_pair"
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_investigation_id
    )
    case_id: Mapped[str] = mapped_column(String(100))
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    programme: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(
        String(12), default=InvestigationStatus.DRAFT.value
    )
    what_happened: Mapped[str | None] = mapped_column(Text)
    unsafe_acts: Mapped[str | None] = mapped_column(Text)
    unsafe_conditions: Mapped[str | None] = mapped_column(Text)
    #: Up to five ``{"question", "answer"}`` steps, in order.
    why_steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    root_cause: Mapped[str | None] = mapped_column(Text)
    #: Why no investigation is needed (status ``not_needed``).
    no_investigation_reason: Mapped[str | None] = mapped_column(Text)
    #: Why the investigation was sent back to draft (the last return).
    return_reason: Mapped[str | None] = mapped_column(Text)
    returned_by: Mapped[uuid.UUID | None]
    returned_at: Mapped[datetime | None]
    submitted_by: Mapped[uuid.UUID | None]
    submitted_at: Mapped[datetime | None]
    #: Approver of an approved investigation, or the decider of a not-needed one.
    decided_by: Mapped[uuid.UUID | None]
    decided_at: Mapped[datetime | None]
    #: Who opened the investigation, and who last changed it or submitted it. The
    #: approver must be none of the three (separation of duties).
    created_by: Mapped[uuid.UUID]
    last_edited_by: Mapped[uuid.UUID]
    #: Every user who has written the content (strings of user ids): none of them may
    #: approve or return the investigation, however many edits came after theirs.
    editor_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class CaseInvestigationFactor(Base):
    """A contributing factor chosen for an investigation. Both foreign keys carry
    the organisation and the programme, so a factor of another list cannot be
    attached."""

    __tablename__ = "investigation_factor"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["investigation_id", "organisation_id", "programme"],
            [
                f"{SCHEMA}.investigation.id",
                f"{SCHEMA}.investigation.organisation_id",
                f"{SCHEMA}.investigation.programme",
            ],
            name="investigation_factor_investigation_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["factor_id", "organisation_id", "programme"],
            [
                f"{SCHEMA}.contributing_factor.id",
                f"{SCHEMA}.contributing_factor.organisation_id",
                f"{SCHEMA}.contributing_factor.programme",
            ],
            name="investigation_factor_factor_fkey",
        ),
        sa.CheckConstraint(_PROGRAMME_CHECK, name="programme"),
        {"schema": SCHEMA},
    )

    investigation_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    factor_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(String(100))
    programme: Mapped[str] = mapped_column(String(30))
    #: The factor's name and category as they were when the investigation was
    #: approved (refreshed then), so a later rename does not change a decided record.
    name_snapshot: Mapped[str] = mapped_column(String(120))
    category_snapshot: Mapped[str] = mapped_column(String(20))
