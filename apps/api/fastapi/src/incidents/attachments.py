"""Photos on incidents (ADR-0067). Service functions flush; routers commit.

The photo itself is an organisation upload (``src/storage/uploads.py``, purpose
``incident-photo``: private, metadata stripped). An incident keeps only the upload
id, checked with ``uploads.file_is_usable``. A screen reads the photo with
``GET /storage/files/{file_id}``. A closed incident takes no photos; photos are
never changed or removed.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError
from src.storage import uploads

from . import service
from .exceptions import IncidentConflictError
from .models import IncidentAttachment, IncidentStatus

PURPOSE = "incident-photo"
MAX_PER_INCIDENT = 50


async def add_attachment(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    file_id: uuid.UUID,
    caption: str | None,
) -> IncidentAttachment:
    incident = await service.get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status == IncidentStatus.CLOSED.value:
        raise IncidentConflictError("This incident is closed; reopen it to add photos")
    if not await uploads.file_is_usable(
        file_id, organisation_id=organisation_id, purpose=PURPOSE
    ):
        raise AppValidationError("The photo is not a finished upload for incidents")
    count = await session.scalar(
        select(func.count())
        .select_from(IncidentAttachment)
        .where(IncidentAttachment.incident_id == incident.id)
    )
    if (count or 0) >= MAX_PER_INCIDENT:
        raise IncidentConflictError(
            f"An incident takes at most {MAX_PER_INCIDENT} photos"
        )
    duplicate = await session.scalar(
        select(IncidentAttachment.id).where(
            IncidentAttachment.incident_id == incident.id,
            IncidentAttachment.file_id == file_id,
        )
    )
    if duplicate is not None:
        raise IncidentConflictError("This photo is already on the incident")
    attachment = IncidentAttachment(
        incident_id=incident.id,
        organisation_id=organisation_id,
        file_id=file_id,
        caption=(caption or "").strip() or None,
        added_by=author.id,
    )
    session.add(attachment)
    await session.flush()
    return attachment


async def for_incident(
    session: AsyncSession, incident_id: str
) -> Sequence[IncidentAttachment]:
    return (
        await session.scalars(
            select(IncidentAttachment)
            .where(IncidentAttachment.incident_id == incident_id)
            .order_by(IncidentAttachment.created_at, IncidentAttachment.id)
        )
    ).all()
