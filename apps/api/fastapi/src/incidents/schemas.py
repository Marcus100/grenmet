"""Request and response bodies of the incidents domain (ADR-0025 schema names)."""

import uuid

from pydantic import EmailStr, Field

from src.models import BaseModel, UtcDateTime

from .models import (
    IncidentAffiliation,
    IncidentPartyKind,
    IncidentStatus,
    IncidentTimelineKind,
)

# --- categories and checklists ----------------------------------------------------


class IncidentCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    #: An active member of the organisation who answers for these incidents.
    manager_user_id: uuid.UUID | None = None


class IncidentCategoryUpdate(BaseModel):
    """Only the fields sent change."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    manager_user_id: uuid.UUID | None = None
    archived: bool | None = None


class IncidentChecklistItemPublic(BaseModel):
    id: str
    category_id: str
    label: str
    required: bool
    position: int
    archived_at: UtcDateTime | None


class IncidentCategoryPublic(BaseModel):
    id: str
    name: str
    description: str | None
    manager_user_id: uuid.UUID | None
    archived_at: UtcDateTime | None
    created_at: UtcDateTime
    checklist: list[IncidentChecklistItemPublic]


class IncidentCategoryList(BaseModel):
    data: list[IncidentCategoryPublic]


class IncidentChecklistItemCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    required: bool = False
    position: int = Field(default=0, ge=0, le=1000)


class IncidentChecklistItemUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    required: bool | None = None
    position: int | None = Field(default=None, ge=0, le=1000)
    archived: bool | None = None


# --- incidents ----------------------------------------------------------------------


class IncidentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    #: When it happened; now when left out. Naive values are read as UTC.
    occurred_at: UtcDateTime | None = None
    category_id: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=10000)
    location: str | None = Field(default=None, max_length=200)
    exercise: bool = False


class IncidentUpdate(BaseModel):
    """Only the fields sent change. The category can change only on a draft."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    occurred_at: UtcDateTime | None = None
    category_id: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=10000)
    location: str | None = Field(default=None, max_length=200)


class IncidentWeather(BaseModel):
    """The aerodrome weather report nearest the incident's time."""

    station: str
    observed_at: UtcDateTime | None
    #: The raw METAR or SPECI text.
    report: str
    #: ``observation`` (Met Service observations) or ``manual`` (typed in).
    source: str


class IncidentWeatherSet(BaseModel):
    """Leave ``report`` out to look the report up from Met Service observations
    (the METAR or SPECI nearest the incident's time). Send it to type one in."""

    station: str = Field(
        pattern=r"^[A-Za-z]{4}$", description="ICAO location indicator, e.g. TGPY."
    )
    report: str | None = Field(default=None, max_length=1000)
    observed_at: UtcDateTime | None = None


class IncidentPublic(BaseModel):
    id: str
    reference: str
    category_id: str | None
    title: str
    summary: str | None
    location: str | None
    occurred_at: UtcDateTime
    exercise: bool
    status: IncidentStatus
    reported_by: uuid.UUID
    reported_by_name: str | None
    weather: IncidentWeather | None = None
    opened_at: UtcDateTime | None
    closed_at: UtcDateTime | None
    closed_by: uuid.UUID | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class IncidentPage(BaseModel):
    data: list[IncidentPublic]
    count: int
    page: int
    size: int
    total_pages: int


class IncidentCheckPublic(BaseModel):
    id: str
    label: str
    required: bool
    position: int
    done_at: UtcDateTime | None
    done_by: uuid.UUID | None


class IncidentCheckUpdate(BaseModel):
    done: bool


class IncidentTimelineCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    #: When the action happened; now when left out.
    occurred_at: UtcDateTime | None = None


class IncidentTimelinePublic(BaseModel):
    id: str
    kind: IncidentTimelineKind
    occurred_at: UtcDateTime
    author_id: uuid.UUID
    author_name: str | None
    text: str
    created_at: UtcDateTime


class IncidentNoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    private: bool = False


class IncidentNotePublic(BaseModel):
    id: str
    author_id: uuid.UUID
    author_name: str | None
    text: str
    private: bool
    created_at: UtcDateTime


class IncidentReopen(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class IncidentDetail(IncidentPublic):
    """Checks in order, the timeline oldest first, notes oldest first. Private
    notes appear only for holders of ``incidents.incidents.private``."""

    checks: list[IncidentCheckPublic]
    timeline: list[IncidentTimelinePublic]
    notes: list[IncidentNotePublic]
    attachments: list[IncidentAttachmentPublic] = []
    parties: list[IncidentPartyPublic] = []
    damage: list[IncidentDamagePublic] = []
    resources: list[IncidentResourcePublic] = []


class IncidentAttachmentCreate(BaseModel):
    """A finished ``incident-photo`` upload (``POST /storage/uploads``)."""

    file_id: uuid.UUID
    caption: str | None = Field(default=None, max_length=200)


class IncidentAttachmentPublic(BaseModel):
    """Read the photo with ``GET /storage/files/{file_id}``."""

    id: str
    file_id: uuid.UUID
    caption: str | None
    added_by: uuid.UUID
    created_at: UtcDateTime


# --- persons, damage and resources (slice 2) ----------------------------------------


class IncidentPartyCreate(BaseModel):
    kind: IncidentPartyKind
    name: str = Field(min_length=1, max_length=120)
    affiliation: IncidentAffiliation = IncidentAffiliation.OTHER
    company: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=40)
    contact_email: EmailStr | None = None
    injured: bool = False
    injury_notes: str | None = Field(default=None, max_length=1000)
    statement: str | None = Field(default=None, max_length=20000)


class IncidentPartyUpdate(BaseModel):
    """Only the fields sent change; the earlier values stay in the history."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    affiliation: IncidentAffiliation | None = None
    company: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=40)
    contact_email: EmailStr | None = None
    injured: bool | None = None
    injury_notes: str | None = Field(default=None, max_length=1000)
    statement: str | None = Field(default=None, max_length=20000)


class IncidentPartyPublic(BaseModel):
    """``contact_*``, ``injury_notes`` and ``statement`` are null unless the viewer
    holds ``incidents.incidents.private``."""

    id: str
    kind: IncidentPartyKind
    name: str
    affiliation: IncidentAffiliation
    company: str | None
    contact_phone: str | None
    contact_email: str | None
    injured: bool
    injury_notes: str | None
    statement: str | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class IncidentDamageCreate(BaseModel):
    item: str | None = Field(default=None, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    #: In the currency's minor unit (cents).
    estimated_cost_minor: int | None = Field(default=None, ge=0)
    currency: str = Field(default="XCD", pattern=r"^[A-Z]{3}$")


class IncidentDamagePublic(BaseModel):
    id: str
    item: str | None
    description: str
    estimated_cost_minor: int | None
    currency: str
    created_at: UtcDateTime


class IncidentResourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=10000)
    started_at: UtcDateTime | None = None
    ended_at: UtcDateTime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class IncidentResourcePublic(BaseModel):
    id: str
    name: str
    quantity: int
    started_at: UtcDateTime | None
    ended_at: UtcDateTime | None
    notes: str | None
    created_at: UtcDateTime


IncidentDetail.model_rebuild()
