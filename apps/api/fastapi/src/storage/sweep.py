"""Scheduled sweep of unreferenced booking uploads (#1972).

Removing a photograph, logo or cover takes the reference away; the stored file stays
until this sweep deletes it. The sweep is allowed to be late. It is not allowed to be
wrong, because a deleted photograph cannot be recovered, so:

* A file is taken only when it is a ``booking-*`` upload, older than ``MIN_AGE``
  (both its creation and its completion), and no row in any reference column points
  at it. ``reference_columns`` lists every such column in the schema. Each is checked
  whatever the file's purpose, so a future feature that reuses an upload is covered.
  ``tests/storage/test_upload_sweep.py`` fails when a new upload-id column is added
  without being listed here.
* Each batch locks its candidates (``FOR UPDATE SKIP LOCKED``) and checks the references
  again under those locks. An attach path locks the upload (``uploads.lock_usable``,
  ``FOR SHARE``) in the same transaction that writes the reference, so the two cannot
  interleave: a locked file is skipped, and a file the sweep deletes can no longer be
  attached.
* The row is deleted and committed first, then the object. A crash or storage error
  after the commit leaves an object that nothing serves (the public route needs the
  row), so the cost is storage, never a broken or exposed photograph. Such an object
  is counted in ``objects_failed`` and logged.

Batches are bounded, each commits on its own, and a second run finds nothing left to do.
"""

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import ColumnElement, and_, delete, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from src.bookings.models import BookingProfile, GalleryPhoto
from src.events.models import Listing, Organiser
from src.incidents.models import IncidentAttachment
from src.opslog.models import OpsLogAttachment
from src.storage import service as storage
from src.storage.models import OrgUpload
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

#: Only uploads of these purposes are ever swept.
PURPOSE_PREFIX = "booking-"
#: Uploaded (created and completed) this recently means mid-flow: never swept.
MIN_AGE = timedelta(hours=24)
BATCH_SIZE = 100
#: At most this many batches per run; the rest wait for the next run.
MAX_BATCHES = 10


@dataclass(frozen=True)
class SweepResult:
    swept: int = 0
    batches: int = 0
    #: Rows deleted whose object the storage call could not delete (left unserved).
    objects_failed: int = 0


def reference_columns() -> tuple[InstrumentedAttribute[Any], ...]:
    """Every column that stores an upload id. Keep this list complete: the guard test
    in ``tests/storage/test_upload_sweep.py`` fails on an unlisted ``*file_id`` column."""
    return (
        BookingProfile.logo_file_id,
        BookingProfile.cover_file_id,
        GalleryPhoto.file_id,
        Organiser.logo_file_id,
        Listing.image_file_id,
        IncidentAttachment.file_id,
        OpsLogAttachment.file_id,
    )


def _unreferenced() -> ColumnElement[bool]:
    """SQL: no reference column points at this upload (NULL-safe, unlike NOT IN)."""
    return and_(
        *(~exists().where(column == OrgUpload.id) for column in reference_columns())
    )


async def _still_referenced(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    """The ids, of those given, that some reference column points at right now."""
    found: set[uuid.UUID] = set()
    for column in reference_columns():
        found.update(
            value
            for value in await session.scalars(select(column).where(column.in_(ids)))
            if value is not None
        )
    return found


async def _sweep_batch(
    session: AsyncSession, *, cutoff: datetime, batch_size: int
) -> tuple[int, list[tuple[uuid.UUID, str]]]:
    """Delete one batch of unreferenced rows and commit. Returns the number of
    candidates seen and the (id, object key) pairs deleted."""
    candidates = (
        await session.execute(
            select(OrgUpload.id, OrgUpload.object_key)
            .where(
                OrgUpload.purpose.startswith(PURPOSE_PREFIX),
                OrgUpload.created_at < cutoff,
                or_(OrgUpload.completed_at.is_(None), OrgUpload.completed_at < cutoff),
                _unreferenced(),
            )
            .order_by(OrgUpload.created_at, OrgUpload.id)
            .limit(batch_size)
            .with_for_update(of=OrgUpload, skip_locked=True)
        )
    ).all()
    if not candidates:
        return 0, []
    # The rows are locked now, so a reference committed before this point is visible.
    referenced = await _still_referenced(session, [row.id for row in candidates])
    deletable = [
        (row.id, row.object_key) for row in candidates if row.id not in referenced
    ]
    if deletable:
        await session.execute(
            delete(OrgUpload).where(OrgUpload.id.in_([uid for uid, _ in deletable]))
        )
    await session.commit()
    return len(candidates), deletable


async def sweep_unreferenced(
    session: AsyncSession,
    *,
    batch_size: int = BATCH_SIZE,
    max_batches: int = MAX_BATCHES,
) -> SweepResult:
    """Delete unreferenced, old booking uploads, batch by batch. Commits per batch.

    Does nothing when storage is not configured, so no row is removed without its
    object being removable.
    """
    if not storage.storage_service.is_configured:
        return SweepResult()
    cutoff = utc_now() - MIN_AGE
    swept = batches = failed = 0
    for _ in range(max_batches):
        seen, deleted = await _sweep_batch(
            session, cutoff=cutoff, batch_size=batch_size
        )
        if seen == 0:
            break
        batches += 1
        swept += len(deleted)
        for upload_id, object_key in deleted:
            try:
                await run_in_threadpool(
                    storage.storage_service.delete_object, object_key
                )
            except (BotoCoreError, ClientError) as error:
                failed += 1
                logger.warning(
                    "Could not delete the object of swept upload %s; the row is gone",
                    upload_id,
                    extra={"area": "storage", "error_type": type(error).__name__},
                )
    if swept:
        logger.info(
            "Swept %s unreferenced booking upload(s)", swept, extra={"area": "storage"}
        )
    return SweepResult(swept=swept, batches=batches, objects_failed=failed)
