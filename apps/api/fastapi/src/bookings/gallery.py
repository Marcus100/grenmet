"""The business's gallery: photographs of its work, shown on its booking page.

A photograph is a completed ``booking-gallery`` upload of the same organisation
(``src/storage/uploads.py``), checked here exactly as the cover photo is checked
before it is stored. The business arranges the order; ``sort_order`` is always
0..n-1 with no hole, because adding appends and removing or reordering renumbers
what is left.

Service functions flush; routers commit.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.storage import uploads
from src.storage.models import OrgUpload, UploadStatus
from src.storage.public_url import public_file_url

from .exceptions import BookingConflictError, BookingNotFoundError
from .models import BookingProfile, GalleryPhoto

logger = logging.getLogger(__name__)

#: The gallery's upload purpose (``src/storage/uploads.py``).
GALLERY_PURPOSE = "booking-gallery"
#: How many photographs one business may show.
MAX_PHOTOS = 12


def lock_key(organisation_id: str) -> str:
    """The advisory-lock key that serialises one business's gallery writes."""
    return f"bookings-gallery:{organisation_id}"


async def _lock(session: AsyncSession, organisation_id: str) -> None:
    """Serialise this business's gallery writes for the rest of the transaction.

    Counting, inserting and renumbering are read-then-write, so two requests for
    one business would otherwise interleave: both could read 11 photographs and
    insert a twelfth and a thirteenth sharing a position, and a reorder racing a
    removal could write a gap or fail on a row another transaction had deleted.
    One transaction-scoped advisory lock per organisation (the pattern in
    ``src/organisations/grants.py``) makes each write read the gallery it changes.
    Another business is a different key, so businesses never wait on each other.
    """
    await session.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(lock_key(organisation_id), 0)
            )
        )
    )


async def _by_file(
    session: AsyncSession, organisation_id: str, file_id: uuid.UUID
) -> GalleryPhoto | None:
    """This business's photograph for that file, or None."""
    found: GalleryPhoto | None = await session.scalar(
        select(GalleryPhoto).where(
            GalleryPhoto.organisation_id == organisation_id,
            GalleryPhoto.file_id == file_id,
        )
    )
    return found


async def list_photos(
    session: AsyncSession, organisation_id: str
) -> list[GalleryPhoto]:
    """The business's photographs in its own order."""
    return list(
        await session.scalars(
            select(GalleryPhoto)
            .where(GalleryPhoto.organisation_id == organisation_id)
            .order_by(GalleryPhoto.sort_order, GalleryPhoto.created_at)
        )
    )


async def add_photo(
    session: AsyncSession, *, organisation_id: str, file_id: uuid.UUID
) -> GalleryPhoto:
    """Append a finished upload to the gallery.

    Adding a file that is already in the gallery answers the row that is there, so
    a retried request never makes a second copy.
    """
    await _lock(session, organisation_id)
    existing = await _by_file(session, organisation_id, file_id)
    if existing is not None:
        return existing
    # Locked until the transaction ends, so the sweep cannot take the file first.
    if not await uploads.lock_usable(
        session, file_id, organisation_id=organisation_id, purpose=GALLERY_PURPOSE
    ):
        raise BookingConflictError(
            "That photograph is not a finished upload for this business"
        )
    count = await session.scalar(
        select(func.count())
        .select_from(GalleryPhoto)
        .where(GalleryPhoto.organisation_id == organisation_id)
    )
    if (count or 0) >= MAX_PHOTOS:
        raise BookingConflictError(
            f"A business can show at most {MAX_PHOTOS} photographs. Remove one first."
        )
    try:
        # A savepoint: a unique violation would otherwise poison the request's
        # transaction, and the caller is owed the row, not a 500.
        async with session.begin_nested():
            photo = GalleryPhoto(
                organisation_id=organisation_id, file_id=file_id, sort_order=count or 0
            )
            session.add(photo)
            await session.flush()
    except IntegrityError:
        # The file is already in this business's gallery: a request that got past
        # the read above (a writer this transaction's lock cannot cover, such as a
        # retry whose first attempt committed after the read) still replays as the
        # docstring promises.
        duplicate = await _by_file(session, organisation_id, file_id)
        if duplicate is None:
            raise
        return duplicate
    return photo


async def remove_photo(
    session: AsyncSession, *, organisation_id: str, photo_id: uuid.UUID
) -> None:
    """Take one photograph out and close the gap it leaves in the order."""
    await _lock(session, organisation_id)
    photo = await session.scalar(
        select(GalleryPhoto).where(
            GalleryPhoto.id == photo_id,
            GalleryPhoto.organisation_id == organisation_id,
        )
    )
    if photo is None:
        raise BookingNotFoundError("Photograph")
    await session.execute(delete(GalleryPhoto).where(GalleryPhoto.id == photo.id))
    await _renumber(session, organisation_id)


async def reorder(
    session: AsyncSession, *, organisation_id: str, ids: list[uuid.UUID]
) -> list[GalleryPhoto]:
    """Set each named photograph's position. Every id must belong to the business
    (404 otherwise); any photograph left out keeps its place after the named ones,
    and the stored order is renumbered so it has no gaps."""
    await _lock(session, organisation_id)
    photos = await list_photos(session, organisation_id)
    by_id = {photo.id: photo for photo in photos}
    if set(ids) - by_id.keys():
        raise BookingNotFoundError("Photograph")
    for position, photo_id in enumerate(ids):
        by_id[photo_id].sort_order = position
    for offset, photo in enumerate(p for p in photos if p.id not in set(ids)):
        photo.sort_order = len(ids) + offset
    await session.flush()
    return await _renumber(session, organisation_id)


async def _renumber(session: AsyncSession, organisation_id: str) -> list[GalleryPhoto]:
    """Rewrite ``sort_order`` as 0..n-1 in the stored order, so a removal never
    leaves a hole."""
    photos = await list_photos(session, organisation_id)
    for position, photo in enumerate(photos):
        photo.sort_order = position
    await session.flush()
    return photos


async def public_gallery(
    session: AsyncSession, profile: BookingProfile
) -> list[dict[str, Any]]:
    """The photographs the public page shows: each one that is still a complete
    ``booking-gallery`` upload of this business and has an https public address.

    Fails closed like the cover photo: any error reading them answers an empty
    gallery, so the booking page still loads. A savepoint keeps a database error
    from aborting the storefront's own transaction.
    """
    try:
        async with session.begin_nested():
            rows = list(
                await session.execute(
                    select(GalleryPhoto.id, GalleryPhoto.file_id)
                    .join(OrgUpload, OrgUpload.id == GalleryPhoto.file_id)
                    .where(
                        GalleryPhoto.organisation_id == profile.organisation_id,
                        OrgUpload.organisation_id == profile.organisation_id,
                        OrgUpload.purpose == GALLERY_PURPOSE,
                        OrgUpload.status == UploadStatus.COMPLETE.value,
                    )
                    .order_by(GalleryPhoto.sort_order, GalleryPhoto.created_at)
                    .limit(MAX_PHOTOS)
                )
            )
    except Exception as error:  # fail closed: a public page must still load
        logger.warning(
            "Storefront gallery check failed for %s; showing no gallery",
            profile.public_slug,
            extra={"error_type": type(error).__name__},
        )
        return []
    images: list[dict[str, Any]] = []
    for photo_id, file_id in rows:
        url = public_file_url(file_id)
        if url is not None and url.startswith("https://"):
            images.append({"id": photo_id, "url": url})
    return images
