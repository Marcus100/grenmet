"""Request and response bodies of the operations log (ADR-0025 schema names)."""

import uuid

from pydantic import Field

from src.models import BaseModel, UtcDateTime

from .models import MAX_EDIT_WINDOW_MINUTES, OpsLogEditRule, OpsLogEntrySource


class OpsLogCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    edit_rule: OpsLogEditRule = OpsLogEditRule.OPEN
    edit_window_minutes: int | None = Field(
        default=None, ge=1, le=MAX_EDIT_WINDOW_MINUTES
    )
    automatic_entries: bool = True


class OpsLogUpdate(BaseModel):
    """Only the fields sent change. ``archived: true`` hides the log from writers."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    edit_rule: OpsLogEditRule | None = None
    edit_window_minutes: int | None = Field(
        default=None, ge=1, le=MAX_EDIT_WINDOW_MINUTES
    )
    automatic_entries: bool | None = None
    archived: bool | None = None


class OpsLogPublic(BaseModel):
    id: str
    name: str
    description: str | None
    edit_rule: OpsLogEditRule
    edit_window_minutes: int | None
    automatic_entries: bool
    archived_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class OpsLogList(BaseModel):
    data: list[OpsLogPublic]


class OpsLogCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    parent_id: str | None = Field(default=None, max_length=100)


class OpsLogCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    archived: bool | None = None


class OpsLogCategoryPublic(BaseModel):
    id: str
    log_id: str
    parent_id: str | None
    name: str
    depth: int
    archived_at: UtcDateTime | None
    created_at: UtcDateTime


class OpsLogCategoryList(BaseModel):
    data: list[OpsLogCategoryPublic]


class OpsLogEntryCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    #: When it happened; now when left out. Naive values are read as UTC.
    occurred_at: UtcDateTime | None = None
    category_id: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    private: bool = False


class OpsLogEntryUpdate(BaseModel):
    """Only the fields sent change. The earlier values stay in the history."""

    text: str | None = Field(default=None, min_length=1, max_length=5000)
    occurred_at: UtcDateTime | None = None
    category_id: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)


class OpsLogRecordRef(BaseModel):
    """The record another module posted an entry about (ADR-0067).

    ``title`` is filled only when the viewer may see that record; otherwise
    ``available`` is false and the screen shows "record not available"."""

    kind: str
    id: str
    title: str | None = None
    available: bool = False


class OpsLogEntryPublic(BaseModel):
    id: str
    log_id: str
    category_id: str | None
    occurred_at: UtcDateTime
    author_id: uuid.UUID | None
    author_name: str | None
    text: str
    location: str | None
    private: bool
    source: OpsLogEntrySource
    record: OpsLogRecordRef | None
    comment_count: int
    edited_at: UtcDateTime | None
    created_at: UtcDateTime


class OpsLogEntryPage(BaseModel):
    """Newest first. Pass ``next_cursor`` back as ``cursor`` for the next page."""

    data: list[OpsLogEntryPublic]
    limit: int
    next_cursor: str | None


class OpsLogCommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class OpsLogCommentPublic(BaseModel):
    id: str
    entry_id: str
    author_id: uuid.UUID
    author_name: str | None
    text: str
    created_at: UtcDateTime


class OpsLogAttachmentCreate(BaseModel):
    """A finished ``opslog-photo`` upload (``POST /storage/uploads``)."""

    file_id: uuid.UUID
    caption: str | None = Field(default=None, max_length=200)


class OpsLogAttachmentPublic(BaseModel):
    """Read the photo with ``GET /storage/files/{file_id}``."""

    id: str
    file_id: uuid.UUID
    caption: str | None
    added_by: uuid.UUID
    created_at: UtcDateTime


class OpsLogEntryDetail(OpsLogEntryPublic):
    comments: list[OpsLogCommentPublic]
    attachments: list[OpsLogAttachmentPublic] = []


class OpsLogSummarySubscription(BaseModel):
    """Whether you get this log's daily summary (bell and email)."""

    subscribed: bool
