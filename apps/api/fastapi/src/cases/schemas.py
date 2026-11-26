"""Request and response bodies of the case engine (ADR-0025 schema names)."""

import uuid
from datetime import date

from pydantic import Field

from src.models import BaseModel, UtcDateTime

from .models import (
    CaseActionStatus,
    CaseRiskBand,
    CaseRiskKind,
    CaseStatus,
    FactorCategory,
    InvestigationStatus,
)

# --- risk grid ----------------------------------------------------------------------


class CaseRiskLikelihood(BaseModel):
    value: int = Field(ge=1, le=9)
    label: str = Field(min_length=1, max_length=60)


class CaseRiskSeverity(BaseModel):
    code: str = Field(pattern=r"^[A-Z]$")
    label: str = Field(min_length=1, max_length=60)


class CaseRiskGridPublic(BaseModel):
    """``cells`` maps an index such as ``4B`` to its band. ``custom`` is false
    while the organisation uses the ICAO Doc 9859 example grid."""

    likelihoods: list[CaseRiskLikelihood]
    severities: list[CaseRiskSeverity]
    cells: dict[str, CaseRiskBand]
    custom: bool


class CaseRiskGridUpdate(BaseModel):
    likelihoods: list[CaseRiskLikelihood] = Field(min_length=2, max_length=7)
    severities: list[CaseRiskSeverity] = Field(min_length=2, max_length=7)
    cells: dict[str, CaseRiskBand]


# --- cases --------------------------------------------------------------------------


class CaseRecordRef(BaseModel):
    """The record a case came from, for example ``incidents.incident``."""

    kind: str = Field(min_length=1, max_length=60, pattern=r"^[a-z_]+\.[a-z_]+$")
    id: str = Field(min_length=1, max_length=100)


class CaseSourcePublic(BaseModel):
    kind: str
    id: str
    title: str | None = None
    available: bool = False


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    location: str | None = Field(default=None, max_length=200)
    occurred_at: UtcDateTime | None = None
    source: CaseRecordRef | None = None


class CaseUpdate(BaseModel):
    """Only the fields sent change."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    location: str | None = Field(default=None, max_length=200)
    occurred_at: UtcDateTime | None = None


class CaseStatusChange(BaseModel):
    """``no_risk`` closes a case in which no hazard was found; it needs ``reason``.
    Reopening a closed case (to ``assessing``) needs ``reason`` too."""

    status: CaseStatus
    no_risk: bool = False
    reason: str | None = Field(default=None, max_length=1000)


class CasePublic(BaseModel):
    id: str
    programme: str
    reference: str
    title: str
    description: str | None
    location: str | None
    occurred_at: UtcDateTime | None
    status: CaseStatus
    source: CaseSourcePublic | None
    reported_by: uuid.UUID
    reported_by_name: str | None
    closed_at: UtcDateTime | None
    closed_by: uuid.UUID | None
    closed_no_risk: bool
    close_reason: str | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CasePage(BaseModel):
    data: list[CasePublic]
    count: int
    page: int
    size: int
    total_pages: int


class CaseRiskAssessmentCreate(BaseModel):
    kind: CaseRiskKind
    likelihood: int = Field(ge=1, le=9)
    severity: str = Field(pattern=r"^[A-Z]$")
    rationale: str | None = Field(default=None, max_length=10000)


class CaseRiskAcceptance(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class CaseRiskAssessmentPublic(BaseModel):
    """``index`` is the grid index, such as ``4B``. The labels and band are as
    they were when the assessment was made."""

    id: str
    kind: CaseRiskKind
    likelihood: int
    likelihood_label: str
    severity: str
    severity_label: str
    index: str
    band: CaseRiskBand
    rationale: str | None
    assessed_by: uuid.UUID
    accepted_by: uuid.UUID | None
    accepted_at: UtcDateTime | None
    acceptance_note: str | None
    created_at: UtcDateTime


class CaseActionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    #: An active member of the organisation.
    owner_user_id: uuid.UUID
    due_date: date


class CaseActionUpdate(BaseModel):
    """Only the fields sent change. A verified action must be sent back to open
    before it can change."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    owner_user_id: uuid.UUID | None = None
    due_date: date | None = None
    progress_note: str | None = Field(default=None, max_length=2000)


class CaseActionStatusChange(BaseModel):
    status: CaseActionStatus


class CaseActionPublic(BaseModel):
    id: str
    case_id: str
    title: str
    description: str | None
    owner_user_id: uuid.UUID
    owner_name: str | None
    due_date: date
    overdue: bool
    status: CaseActionStatus
    progress_note: str | None
    done_at: UtcDateTime | None
    verified_by: uuid.UUID | None
    verified_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


# --- investigation -----------------------------------------------------------------


class ContributingFactorCreate(BaseModel):
    category: FactorCategory
    name: str = Field(min_length=1, max_length=120)


class ContributingFactorUpdate(BaseModel):
    """Only the fields sent change. A retired factor (``is_active`` false) stays on
    the investigations that chose it but cannot be chosen again."""

    category: FactorCategory | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class ContributingFactorPublic(BaseModel):
    id: str
    category: FactorCategory
    name: str
    is_active: bool
    updated_at: UtcDateTime


class WhyStep(BaseModel):
    """One step of the "5 whys". ``answer`` may be empty while the investigation
    is a draft; submitting needs every step answered."""

    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(default="", max_length=2000)


class InvestigationUpdate(BaseModel):
    """Only the fields sent change. ``why_steps`` and ``contributing_factor_ids``
    replace the whole list when sent. Only a draft changes."""

    what_happened: str | None = Field(default=None, max_length=10000)
    unsafe_acts: str | None = Field(default=None, max_length=10000)
    unsafe_conditions: str | None = Field(default=None, max_length=10000)
    why_steps: list[WhyStep] | None = Field(default=None, max_length=5)
    root_cause: str | None = Field(default=None, max_length=10000)
    contributing_factor_ids: list[str] | None = Field(default=None, max_length=50)


class InvestigationDecision(BaseModel):
    """The reason for returning an investigation or for deciding that none is needed."""

    reason: str = Field(min_length=1, max_length=1000)


class InvestigationPublic(BaseModel):
    id: str
    case_id: str
    status: InvestigationStatus
    what_happened: str | None
    unsafe_acts: str | None
    unsafe_conditions: str | None
    why_steps: list[WhyStep]
    root_cause: str | None
    contributing_factors: list[ContributingFactorPublic]
    no_investigation_reason: str | None
    return_reason: str | None
    returned_by: uuid.UUID | None
    returned_at: UtcDateTime | None
    submitted_by: uuid.UUID | None
    submitted_at: UtcDateTime | None
    decided_by: uuid.UUID | None
    decided_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class CaseDetail(CasePublic):
    """Assessments oldest first; actions by due date. ``investigation`` is null until
    the investigation is first written."""

    risk_assessments: list[CaseRiskAssessmentPublic]
    actions: list[CaseActionPublic]
    investigation: InvestigationPublic | None = None
