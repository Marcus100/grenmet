"""Photos on log entries (ADR-0067). Service functions flush; routers commit.

The photo itself is an organisation upload (``src/storage/uploads.py``, purpose
``opslog-photo``: private, metadata stripped). An entry keeps only the upload id,
checked with ``uploads.file_is_usable`` so a pending upload, another
organisation's file or another purpose is refused. A screen reads the photo with
``GET /storage/files/{file_id}``. Attachments follow the comment rule: refused on
an archived or locked log, never changed or removed.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError
from src.storage import uploads

from . import service
from .exceptions import OpsLogConflictError
from .models import OpsLogAttachment, OpsLogEditRule

PURPOSE = "opslog-photo"
MAX_PER_ENTRY = 20


async def add_attachment(
    session: AsyncSession,
    *,
    organisation_id: str,
    entry_id: str,
    author: User,
    can_read_private: bool,
    file_id: uuid.UUID,
    caption: str | None,
) -> OpsLogAttachment:
    # Checked first: it opens its own connection, which should not wait on the lock.
    if not await uploads.file_is_usable(
        file_id, organisation_id=organisation_id, purpose=PURPOSE
    ):
        raise AppValidationError("The photo is not a finished upload for this log")
    entry = await service.visible_entry(
        session,
        organisation_id=organisation_id,
        entry_id=entry_id,
        can_read_private=can_read_private,
        lock=True,
    )
    log = await service.get_log(
        session, organisation_id=organisation_id, log_id=entry.log_id
    )
    if log.archived_at is not None:
        raise OpsLogConflictError("This log is archived")
    if log.edit_rule == OpsLogEditRule.LOCKED.value:
        raise OpsLogConflictError("This log is locked; entries take no photos")
    count = await session.scalar(
        select(func.count())
        .select_from(OpsLogAttachment)
        .where(OpsLogAttachment.entry_id == entry.id)
    )
    if (count or 0) >= MAX_PER_ENTRY:
        raise OpsLogConflictError(f"An entry takes at most {MAX_PER_ENTRY} photos")
    duplicate = await session.scalar(
        select(OpsLogAttachment.id).where(
            OpsLogAttachment.entry_id == entry.id, OpsLogAttachment.file_id == file_id
        )
    )
    if duplicate is not None:
        raise OpsLogConflictError("This photo is already on the entry")
    attachment = OpsLogAttachment(
        entry_id=entry.id,
        organisation_id=organisation_id,
        file_id=file_id,
        caption=(caption or "").strip() or None,
        added_by=author.id,
    )
    session.add(attachment)
    try:
        await session.flush()
    except IntegrityError as exc:
        # The unique (entry, file) pair: a second request raced past the check.
        raise OpsLogConflictError("This photo is already on the entry") from exc
    return attachment


async def for_entry(session: AsyncSession, entry_id: str) -> Sequence[OpsLogAttachment]:
    """An entry's photos, oldest first. The caller has already checked visibility."""
    return (
        await session.scalars(
            select(OpsLogAttachment)
            .where(OpsLogAttachment.entry_id == entry_id)
            .order_by(OpsLogAttachment.created_at, OpsLogAttachment.id)
        )
    ).all()
