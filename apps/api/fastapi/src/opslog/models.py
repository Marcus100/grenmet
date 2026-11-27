"""Operations log tables (ADR-0067, main database, ``opslog`` schema).

``log`` is one named logbook of an organisation (operations, security, duty
managers). ``category`` is a three-level tree per log. ``entry`` is one
time-stamped line written by a person or posted by another module through the
outbox (``source = 'automatic'``). ``entry_comment`` rows are only ever
inserted: an update to an entry never rewrites what it said. Author ids are
auth user ids with no foreign key, so deleting an account never deletes a log.
Datetimes are naive UTC.
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

SCHEMA = "opslog"
MAX_CATEGORY_DEPTH = 3
MAX_EDIT_WINDOW_MINUTES = 10080  # one week


class OpsLogEditRule(str, Enum):
    """What may change after an entry is written."""

    OPEN = "open"  # the author may edit, within the edit window if one is set
    APPEND_ONLY = "append_only"  # no edits; comments add updates
    LOCKED = "locked"  # no edits and no comments


class OpsLogEntrySource(str, Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


def new_log_id() -> str:
    return f"olg_{secrets.token_hex(8)}"


def new_category_id() -> str:
    return f"olc_{secrets.token_hex(8)}"


def new_entry_id() -> str:
    return f"ole_{secrets.token_hex(8)}"


def new_comment_id() -> str:
    return f"olm_{secrets.token_hex(8)}"


class OpsLog(Base):
    __tablename__ = "log"
    __table_args__ = (
        sa.UniqueConstraint("organisation_id", "name", name="log_organisation_name"),
        sa.CheckConstraint(
            f"edit_rule IN ({_values(OpsLogEditRule)})", name="edit_rule"
        ),
        sa.CheckConstraint(
            "edit_window_minutes IS NULL OR edit_window_minutes BETWEEN 1 AND "
            f"{MAX_EDIT_WINDOW_MINUTES}",
            name="edit_window",
        ),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_log_id)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(500))
    edit_rule: Mapped[str] = mapped_column(
        String(20), default=OpsLogEditRule.OPEN.value
    )
    #: Minutes after writing during which the author may still edit (``open`` only).
    #: NULL means no limit.
    edit_window_minutes: Mapped[int | None]
    #: Whether this log receives automatic entries from other modules when a
    #: message names no log.
    automatic_entries: Mapped[bool] = mapped_column(default=True)
    archived_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class OpsLogCategory(Base):
    __tablename__ = "category"
    __table_args__ = (
        sa.CheckConstraint(f"depth BETWEEN 1 AND {MAX_CATEGORY_DEPTH}", name="depth"),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_category_id
    )
    log_id: Mapped[str] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.log.id", ondelete="CASCADE"), index=True
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.category.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    depth: Mapped[int] = mapped_column(sa.SmallInteger)
    archived_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class OpsLogEntry(Base):
    __tablename__ = "entry"
    __table_args__ = (
        sa.CheckConstraint(f"source IN ({_values(OpsLogEntrySource)})", name="source"),
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 5000", name="text"),
        sa.CheckConstraint(
            "(source_kind IS NULL) = (source_id IS NULL)", name="source_ref"
        ),
        sa.UniqueConstraint("outbox_message_id", name="entry_outbox_message_id_key"),
        # The log listing: newest first, keyset on (occurred_at, id).
        sa.Index("entry_log_occurred_idx", "log_id", "occurred_at", "id"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=new_entry_id)
    log_id: Mapped[str] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.log.id", ondelete="CASCADE")
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.category.id", ondelete="SET NULL"),
        index=True,
    )
    occurred_at: Mapped[datetime]
    #: NULL for an automatic entry.
    author_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    text: Mapped[str] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    private: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(
        String(20), default=OpsLogEntrySource.MANUAL.value
    )
    #: The record another module posted this entry about, as ``(kind, id)``
    #: (ADR-0067), for example ``("incidents.incident", "inc_...")``.
    source_kind: Mapped[str | None] = mapped_column(String(60))
    source_id: Mapped[str | None] = mapped_column(String(100))
    #: The outbox message that posted it, so a repeated delivery adds nothing.
    outbox_message_id: Mapped[uuid.UUID | None]
    edited_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class OpsLogComment(Base):
    """An update to an entry. Rows are only ever inserted."""

    __tablename__ = "entry_comment"
    __table_args__ = (
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 2000", name="text"),
        sa.Index("entry_comment_entry_created_idx", "entry_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_comment_id
    )
    entry_id: Mapped[str] = mapped_column(
        String(100), ForeignKey(f"{SCHEMA}.entry.id", ondelete="CASCADE")
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID]
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


def new_attachment_id() -> str:
    return f"ola_{secrets.token_hex(8)}"


class OpsLogAttachment(Base):
    """A photo added to an entry: the storage upload id only (purpose
    ``opslog-photo``). Rows are only ever inserted."""

    __tablename__ = "entry_attachment"
    __table_args__ = (
        sa.UniqueConstraint("entry_id", "file_id", name="entry_attachment_entry_file"),
        sa.CheckConstraint(
            "caption IS NULL OR char_length(caption) BETWEEN 1 AND 200",
            name="caption",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(
        String(100), primary_key=True, default=new_attachment_id
    )
    entry_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.entry.id", ondelete="CASCADE"),
        index=True,
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    file_id: Mapped[uuid.UUID]
    caption: Mapped[str | None] = mapped_column(String(200))
    added_by: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class OpsLogSummarySubscriber(Base):
    """A member who asked for a log's daily summary (bell and email)."""

    __tablename__ = "summary_subscriber"
    __table_args__ = ({"schema": SCHEMA},)

    log_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey(f"{SCHEMA}.log.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
