"""Request and response bodies of the incidents domain (ADR-0025 schema names)."""

import uuid

from pydantic import Field

from src.models import BaseModel, UtcDateTime

from .models import IncidentStatus, IncidentTimelineKind

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


IncidentDetail.model_rebuild()
