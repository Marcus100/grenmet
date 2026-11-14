"""Profile photos: upload, remove and who may see them (#1303).

Rows live in ``public.user_image`` (``src.auth.models.UserImage``, one per user;
``object_key`` is the storage prefix of that upload's WebP sizes). The older
``userimage`` table from the baseline migration is unused and left alone.

Owner decisions (2026-11-13): a person uploads and replaces their own photo, with
no approval step; HR (``hr.employment.manage`` over that person) and superusers
may remove one. A photo is visible to its owner, superusers and signed-in people
who share an organisation with the owner: an active membership of the same
platform organisation, or active employment in the same HR organisation.
"""

import asyncio
import logging
import uuid
from datetime import datetime

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import and_, exists, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from starlette.concurrency import run_in_threadpool

from src.auth.models import User, UserImage
from src.auth.policy import can_act_on_user
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.organisations.models import (
    Membership,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)
from src.storage import service as storage
from src.utils.datetime import utc_now

from . import images
from .exceptions import (
    ProfileImageForbiddenError,
    ProfileImageNotFoundError,
    ProfileImageStorageUnavailableError,
)

logger = logging.getLogger(__name__)

#: Photos processed at once per API process; decoding is memory heavy.
_PROCESSING = asyncio.Semaphore(2)

#: A page showing many avatars asks again for a missing photo at most this often.
NOT_FOUND_CACHE = {
    "Cache-Control": "private, max-age=60",
    "Vary": "Authorization, Cookie",
}

#: Presigned read links live this long; pages cache the redirect for less.
READ_LINK_SECONDS = 300


def object_key(prefix: str, size: int) -> str:
    return f"{prefix}/{size}.webp"


def _require_storage() -> None:
    if not storage.storage_service.is_configured:
        raise ProfileImageStorageUnavailableError()


async def get_image(*, session: AsyncSession, user_id: uuid.UUID) -> UserImage | None:
    row: UserImage | None = await session.scalar(
        select(UserImage).where(UserImage.user_id == user_id)
    )
    return row


async def _delete_objects(prefix: str) -> None:
    """Best effort: a stray object is harmless, a failed request must not 500."""
    for size in images.SIZES:
        try:
            await run_in_threadpool(
                storage.storage_service.delete_object, object_key(prefix, size)
            )
        except BotoCoreError, ClientError, OSError:
            logger.warning("Profile photo object not deleted", extra={"prefix": prefix})


#: Seconds a clean-up waits before checking, so a commit already sent by a
#: cancelled request lands first (the row lock below then waits for it too).
RECONCILE_DELAY_SECONDS = 5.0

#: Clean-ups started after a save whose outcome is unknown; held so they finish.
_RECONCILES: set[asyncio.Task[None]] = set()


async def _reconcile_upload(user_id: uuid.UUID, prefix: str) -> None:
    """Keep an upload's files only if the saved row points at them.

    Runs on its own session, outside the request: after a failed or cancelled
    save the request's session may be unusable, and the commit may even have
    reached the database before the request was cancelled.
    """
    from src.database import async_session_factory

    await asyncio.sleep(RECONCILE_DELAY_SECONDS)
    try:
        async with async_session_factory() as fresh:
            current = await fresh.scalar(
                select(UserImage.object_key)
                .where(UserImage.user_id == user_id)
                .with_for_update()
            )
            await fresh.rollback()
    except SQLAlchemyError, OSError:
        logger.warning("Profile photo upload not reconciled", extra={"prefix": prefix})
        return
    if current != prefix:
        await delete_stored_files(prefix)


def _schedule_reconcile(user_id: uuid.UUID, prefix: str) -> None:
    task = asyncio.create_task(_reconcile_upload(user_id, prefix))
    _RECONCILES.add(task)
    task.add_done_callback(_RECONCILES.discard)


async def wait_for_reconciles() -> None:
    """Tests: let scheduled clean-ups finish."""
    while _RECONCILES:
        await asyncio.gather(*_RECONCILES)


async def delete_stored_files(prefix: str) -> None:
    """Remove an upload's stored sizes, if storage is configured (best effort)."""
    if storage.storage_service.is_configured:
        await _delete_objects(prefix)


async def _point_row_at(
    session: AsyncSession, user_id: uuid.UUID, prefix: str
) -> str | None:
    """Make the person's row point at ``prefix``; return the prefix it replaced.

    A new row is inserted, or the existing one is locked before it is repointed,
    so the replaced files are always known. If the row disappears between the
    two steps (a concurrent removal), the insert is tried again.
    """
    for _ in range(2):
        now = utc_now()
        inserted = await session.scalar(
            insert(UserImage)
            .values(
                id=uuid.uuid4(),
                user_id=user_id,
                object_key=prefix,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=[UserImage.user_id])
            .returning(UserImage.id)
        )
        if inserted is not None:
            return None
        previous = await session.scalar(
            select(UserImage.object_key)
            .where(UserImage.user_id == user_id)
            .with_for_update()
        )
        if previous is not None:
            await session.execute(
                update(UserImage)
                .where(UserImage.user_id == user_id)
                .values(object_key=prefix, updated_at=now)
            )
            return previous
    raise ProfileImageNotFoundError()


async def set_image(*, session: AsyncSession, user: User, raw: bytes) -> UserImage:
    """Store a new photo for ``user`` and drop the previous one.

    The files go up first under a fresh prefix, then the row points at them
    (``_point_row_at``). If the save does not finish, including a cancelled
    request, a background clean-up deletes the new files unless the row turned
    out to point at them.
    """
    _require_storage()
    async with _PROCESSING:
        sizes = await run_in_threadpool(images.process, raw)
    prefix = f"users/{user.id}/profile-image/{uuid.uuid4().hex}"
    saved = False
    previous: str | None = None
    try:
        for size, data in sizes.items():
            await run_in_threadpool(
                storage.storage_service.put_object,
                object_key(prefix, size),
                data,
                content_type="image/webp",
            )
        previous = await _point_row_at(session, user.id, prefix)
        await session.commit()
        saved = True
    finally:
        if not saved:
            # No await here: a cancelled request cannot interrupt scheduling.
            _schedule_reconcile(user.id, prefix)
    if previous and previous != prefix:
        await _delete_objects(previous)
    row: UserImage | None = await session.scalar(
        select(UserImage)
        .where(UserImage.user_id == user.id)
        .execution_options(populate_existing=True)
    )
    if row is None:  # removed by a concurrent request after the commit
        raise ProfileImageNotFoundError()
    return row


async def remove_image(*, session: AsyncSession, user_id: uuid.UUID) -> None:
    # Locked and re-read, so a concurrent upload's repointing is seen and its
    # files are the ones deleted.
    row: UserImage | None = await session.scalar(
        select(UserImage)
        .where(UserImage.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise ProfileImageNotFoundError()
    prefix = row.object_key
    await session.delete(row)
    await session.commit()
    await delete_stored_files(prefix)


async def remove_for_staff(
    *, session: AsyncSession, current_user: User, user_id: uuid.UUID
) -> None:
    """HR or a superuser removes someone's unsuitable photo (audited)."""
    allowed = current_user.id != user_id and await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        permission_key="hr.employment.manage",
    )
    if not allowed:
        raise ProfileImageForbiddenError()
    await remove_image(session=session, user_id=user_id)


async def shares_organisation(
    *, session: AsyncSession, viewer_id: uuid.UUID, owner_id: uuid.UUID
) -> bool:
    if viewer_id == owner_id:
        return True
    mine = aliased(Membership)
    theirs = aliased(Membership)
    same_platform = exists().where(
        and_(
            mine.user_id == viewer_id,
            mine.status == MembershipStatus.ACTIVE.value,
            theirs.user_id == owner_id,
            theirs.status == MembershipStatus.ACTIVE.value,
            theirs.organisation_id == mine.organisation_id,
            PlatformOrganisation.id == mine.organisation_id,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
        )
    )
    my_job = aliased(EmploymentRecord)
    their_job = aliased(EmploymentRecord)
    same_employer = exists().where(
        and_(
            my_job.user_id == viewer_id,
            my_job.status == EmploymentStatus.ACTIVE,
            their_job.user_id == owner_id,
            their_job.status == EmploymentStatus.ACTIVE,
            their_job.organisation_id == my_job.organisation_id,
        )
    )
    return bool(await session.scalar(select(same_platform | same_employer)))


async def read_link(
    *, session: AsyncSession, viewer: User, owner_id: uuid.UUID, size: int
) -> tuple[str, datetime]:
    """A short-lived link to the photo, or 404 when absent or not visible.

    Absent and hidden answer the same, so the route cannot be used to learn who
    has a photo outside the viewer's organisations.
    """
    _require_storage()
    row = await get_image(session=session, user_id=owner_id)
    visible = viewer.is_superuser or await shares_organisation(
        session=session, viewer_id=viewer.id, owner_id=owner_id
    )
    if row is None or not visible:
        raise ProfileImageNotFoundError(headers=NOT_FOUND_CACHE)
    link = storage.storage_service.presigned_download_url(
        object_key(row.object_key, size), expires_in=READ_LINK_SECONDS
    )
    return link, row.updated_at
