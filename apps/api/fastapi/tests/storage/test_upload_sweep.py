"""The scheduled sweep of unreferenced booking uploads (#1972).

A ``booking-*`` upload that no row references and that is older than the window is
deleted: its row first, in one committed batch, then its object. Every reference
column in the schema is checked, whatever the file's purpose, so a file that any
feature still points at is never taken. The fake store only records deletions.
"""

import uuid
from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from botocore.exceptions import ClientError
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingProfile, GalleryPhoto
from src.database import async_session_factory
from src.events.models import Listing, Organiser
from src.incidents.models import Incident, IncidentAttachment
from src.model_registry import import_all_models
from src.opslog.models import OpsLog, OpsLogAttachment, OpsLogEntry
from src.orm import Base
from src.storage import service as storage
from src.storage import sweep, uploads
from src.storage.config import StorageConfig
from src.storage.models import OrgUpload
from src.storage.service import StorageService
from src.utils.datetime import utc_now
from tests.bookings.test_business_cover import _body
from tests.bookings.test_public_bookings import API, _studio
from tests.factories import make_user
from tests.organisations.support import make_org

OLD = timedelta(days=2)
NEW = timedelta(hours=1)


class FakeStore(StorageService):
    def __init__(self) -> None:
        super().__init__(
            StorageConfig(
                STORAGE_ENDPOINT_URL="https://nyc3.digitaloceanspaces.com",
                STORAGE_REGION="nyc3",
                STORAGE_BUCKET="test-space",
                STORAGE_ACCESS_KEY_ID="AKIATESTKEY",
                STORAGE_SECRET_ACCESS_KEY="secretdummy",
            )
        )
        self.deleted: list[str] = []
        self.fail_deletes = False

    def delete_object(self, key: str) -> None:
        if self.fail_deletes:
            raise ClientError(
                {"Error": {"Code": "InternalError", "Message": "down"}}, "DeleteObject"
            )
        self.deleted.append(key)


@pytest.fixture(autouse=True)
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStore]:
    fake = FakeStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


async def _upload(
    db: AsyncSession,
    org_id: str,
    *,
    purpose: str = "booking-gallery",
    app: str = "bookings",
    created_ago: timedelta = OLD,
    completed_ago: timedelta | None = OLD,
    status: str = "complete",
) -> OrgUpload:
    """A stored upload whose clocks are set in the past (or recent)."""
    now = utc_now()
    upload_id = uuid.uuid4()
    row = OrgUpload(
        id=upload_id,
        organisation_id=org_id,
        app=app,
        purpose=purpose,
        object_key=f"org/{org_id}/{app}/{purpose}/{upload_id}.jpg",
        content_type="image/jpeg",
        size_bytes=1000,
        status=status,
        created_by_user_id=None,
        created_at=now - created_ago,
        expires_at=now + timedelta(minutes=15),
        completed_at=None if completed_ago is None else now - completed_ago,
    )
    db.add(row)
    await db.commit()
    return row


async def _exists(_db: AsyncSession, upload_id: uuid.UUID) -> bool:
    """Read the row from the database, not this session's identity map."""
    async with async_session_factory() as fresh:
        found = await fresh.scalar(
            select(OrgUpload.id).where(OrgUpload.id == upload_id)
        )
    return found is not None


async def _sweep(**kwargs: Any) -> sweep.SweepResult:
    async with async_session_factory() as session:
        return await sweep.sweep_unreferenced(session, **kwargs)


# --- what gets swept -----------------------------------------------------------------


@pytest.mark.usefixtures("db_async")
@pytest.mark.parametrize(
    "purpose", ["booking-logo", "booking-cover", "booking-gallery"]
)
async def test_an_unreferenced_old_booking_upload_is_swept(
    db_async: AsyncSession, store: FakeStore, purpose: str
) -> None:
    org = await make_org(db_async, f"Sweep {purpose}")
    row = await _upload(db_async, org.id, purpose=purpose)

    result = await _sweep()

    assert result.swept >= 1
    assert not await _exists(db_async, row.id)
    assert row.object_key in store.deleted


async def test_a_reference_removed_just_inside_the_window_keeps_the_file(
    db_async: AsyncSession, store: FakeStore
) -> None:
    """The 24-hour boundary: a file uploaded just under a day ago, whose reference is
    removed now, is kept; the same file just over a day old is taken."""
    org = await make_org(db_async, "Boundary")
    row = await _upload(
        db_async,
        org.id,
        purpose="booking-gallery",
        created_ago=sweep.MIN_AGE - timedelta(minutes=1),
        completed_ago=sweep.MIN_AGE - timedelta(minutes=1),
    )
    db_async.add(GalleryPhoto(organisation_id=org.id, file_id=row.id, sort_order=0))
    await db_async.commit()
    await _detach_gallery(db_async, row.id)()

    await _sweep()
    assert await _exists(db_async, row.id), "a file inside the window was taken"
    assert row.object_key not in store.deleted

    async with async_session_factory() as aging:
        await aging.execute(
            update(OrgUpload)
            .where(OrgUpload.id == row.id)
            .values(
                created_at=utc_now() - sweep.MIN_AGE - timedelta(minutes=1),
                completed_at=utc_now() - sweep.MIN_AGE - timedelta(minutes=1),
            )
        )
        await aging.commit()
    await _sweep()
    assert not await _exists(db_async, row.id)


async def test_a_pending_upload_older_than_the_window_is_swept(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, "Never completed")
    row = await _upload(db_async, org.id, status="pending", completed_ago=None)

    await _sweep()

    assert not await _exists(db_async, row.id)


async def test_an_upload_inside_the_window_is_not_swept(
    db_async: AsyncSession, store: FakeStore
) -> None:
    org = await make_org(db_async, "Mid flow")
    row = await _upload(db_async, org.id, created_ago=NEW, completed_ago=NEW)

    await _sweep()

    assert await _exists(db_async, row.id)
    assert row.object_key not in store.deleted


async def test_a_pending_upload_inside_the_window_is_not_swept(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, "Pending now")
    row = await _upload(
        db_async, org.id, status="pending", created_ago=NEW, completed_ago=None
    )

    await _sweep()

    assert await _exists(db_async, row.id)


async def test_an_old_upload_completed_just_now_is_not_swept(
    db_async: AsyncSession,
) -> None:
    """Created three days ago but completed an hour ago: it is mid-flow, not old."""
    org = await make_org(db_async, "Just completed")
    row = await _upload(db_async, org.id, created_ago=OLD * 2, completed_ago=NEW)

    await _sweep()

    assert await _exists(db_async, row.id)


@pytest.mark.parametrize(
    ("purpose", "app"),
    [
        ("organiser-logo", "events"),
        ("listing-image", "events"),
        ("incident-photo", "incidents"),
        ("opslog-photo", "opslog"),
    ],
)
async def test_an_upload_of_another_purpose_is_not_touched(
    db_async: AsyncSession, store: FakeStore, purpose: str, app: str
) -> None:
    org = await make_org(db_async, f"Other {purpose}")
    row = await _upload(db_async, org.id, purpose=purpose, app=app)

    await _sweep()

    assert await _exists(db_async, row.id)
    assert row.object_key not in store.deleted


# --- references: one test per referencing column ----------------------------------------


async def _gallery_row(db: AsyncSession, org_id: str, file_id: uuid.UUID) -> None:
    db.add(GalleryPhoto(organisation_id=org_id, file_id=file_id, sort_order=0))
    await db.commit()


async def _events_organiser_logo(db: AsyncSession, org_id: str, file_id: uuid.UUID):
    row = Organiser(
        slug=f"o-{uuid.uuid4().hex[:8]}",
        name="Organiser",
        organisation_id=org_id,
        logo_file_id=file_id,
    )
    db.add(row)
    await db.commit()
    return row


async def _events_listing_image(db: AsyncSession, file_id: uuid.UUID):
    organiser = Organiser(slug=f"o-{uuid.uuid4().hex[:8]}", name="Organiser")
    db.add(organiser)
    await db.flush()
    listing = Listing(
        slug=f"l-{uuid.uuid4().hex[:8]}",
        title="Listing",
        parish="st-george",
        venue="Hall",
        starts_at=utc_now().replace(tzinfo=None),
        ends_at=utc_now().replace(tzinfo=None),
        admission="free",
        organiser_id=organiser.id,
        image_file_id=file_id,
    )
    db.add(listing)
    await db.commit()
    return listing


async def _incident_attachment(db: AsyncSession, org_id: str, file_id: uuid.UUID):
    user = await make_user(db)
    incident = Incident(
        organisation_id=org_id,
        reference=f"INC-{uuid.uuid4().hex[:8]}",
        title="Incident",
        occurred_at=utc_now().replace(tzinfo=None),
        reported_by=user.id,
    )
    db.add(incident)
    await db.flush()
    attachment = IncidentAttachment(
        incident_id=incident.id,
        organisation_id=org_id,
        file_id=file_id,
        added_by=user.id,
    )
    db.add(attachment)
    await db.commit()
    return attachment


async def _opslog_attachment(db: AsyncSession, org_id: str, file_id: uuid.UUID):
    user = await make_user(db)
    log = OpsLog(organisation_id=org_id, name=f"Log {uuid.uuid4().hex[:6]}")
    db.add(log)
    await db.flush()
    entry = OpsLogEntry(
        log_id=log.id,
        organisation_id=org_id,
        occurred_at=utc_now().replace(tzinfo=None),
        text="Entry",
    )
    db.add(entry)
    await db.flush()
    attachment = OpsLogAttachment(
        entry_id=entry.id, organisation_id=org_id, file_id=file_id, added_by=user.id
    )
    db.add(attachment)
    await db.commit()
    return attachment


@pytest.mark.parametrize(
    "column",
    [
        "profile.logo_file_id",
        "profile.cover_file_id",
        "gallery_photo.file_id",
        "events.organisers.logo_file_id",
        "events.listings.image_file_id",
        "incidents.attachment.file_id",
        "opslog.entry_attachment.file_id",
    ],
)
async def test_a_file_referenced_by_each_column_is_kept_until_that_reference_goes(
    db_async: AsyncSession,
    store: FakeStore,
    async_client: httpx.AsyncClient,
    column: str,
) -> None:
    """Each referencing column protects an old booking upload, whatever its purpose.
    Removing the one reference lets the sweep take the file, which shows that column
    is what kept it. The bookings columns are set through the Studio API; the other
    domains' rows are written directly, because a file of a booking purpose is
    not something those domains would attach through their own routes."""
    if column in ("profile.logo_file_id", "profile.cover_file_id"):
        studio = await _studio(db_async, async_client)
        purpose = "booking-logo" if "logo" in column else "booking-cover"
        row = await _upload(db_async, studio.org_id, purpose=purpose)
        field = "logo_file_id" if "logo" in column else "cover_file_id"
        put = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json=_body(studio, **{field: str(row.id)}),
        )
        assert put.status_code == 200, put.text
        detach = _detach_profile_column(db_async, studio.org_id, field)
    else:
        org = await make_org(db_async, f"Ref {column}")
        row = await _upload(db_async, org.id, purpose="booking-gallery")
        if column == "gallery_photo.file_id":
            await _gallery_row(db_async, org.id, row.id)
            detach = _delete_gallery_rows(db_async, row.id)
        elif column == "events.organisers.logo_file_id":
            detach = _delete_row(
                db_async, await _events_organiser_logo(db_async, org.id, row.id)
            )
        elif column == "events.listings.image_file_id":
            detach = _delete_row(
                db_async, await _events_listing_image(db_async, row.id)
            )
        elif column == "incidents.attachment.file_id":
            detach = _delete_row(
                db_async, await _incident_attachment(db_async, org.id, row.id)
            )
        else:
            detach = _delete_row(
                db_async, await _opslog_attachment(db_async, org.id, row.id)
            )

    await _sweep()
    assert await _exists(db_async, row.id), f"{column} did not protect the file"
    assert row.object_key not in store.deleted

    await detach()
    await _sweep()
    assert not await _exists(db_async, row.id)
    assert row.object_key in store.deleted


def _detach_profile_column(
    db: AsyncSession, org_id: str, column: str
) -> Callable[[], Any]:
    async def clear() -> None:
        values = {column: None}
        await db.execute(
            update(BookingProfile)
            .where(BookingProfile.organisation_id == org_id)
            .values(**values)
        )
        await db.commit()

    return clear


def _detach_gallery(db: AsyncSession, file_id: uuid.UUID) -> Callable[[], Any]:
    return _delete_gallery_rows(db, file_id)


def _delete_gallery_rows(db: AsyncSession, file_id: uuid.UUID) -> Callable[[], Any]:
    async def clear() -> None:
        await db.execute(delete(GalleryPhoto).where(GalleryPhoto.file_id == file_id))
        await db.commit()

    return clear


def _delete_row(db: AsyncSession, row: Any) -> Callable[[], Any]:
    async def clear() -> None:
        await db.delete(row)
        await db.commit()

    return clear


# --- two references, one removed ------------------------------------------------------


async def test_a_file_referenced_twice_is_kept_after_one_reference_goes(
    db_async: AsyncSession, store: FakeStore, async_client: httpx.AsyncClient
) -> None:
    """A gallery photograph that is also the profile's cover pointer (a reference the
    purpose rule normally forbids: a future feature could do it). Removing the gallery
    photograph leaves the cover pointer, so the file must survive the sweep; clearing
    the cover pointer as well lets it go."""
    studio = await _studio(db_async, async_client)
    row = await _upload(db_async, studio.org_id, purpose="booking-gallery")
    added = await async_client.post(
        f"{API}/org/gallery", headers=studio.headers, json={"file_id": str(row.id)}
    )
    assert added.status_code == 201, added.text
    photo_id = added.json()["id"]
    await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_body(studio)
    )
    await db_async.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(cover_file_id=row.id)
    )
    await db_async.commit()

    removed = await async_client.delete(
        f"{API}/org/gallery/{photo_id}", headers=studio.headers
    )
    assert removed.status_code == 204, removed.text
    await _sweep()
    assert await _exists(db_async, row.id), "the cover pointer did not keep the file"
    assert row.object_key not in store.deleted

    await _detach_profile_column(db_async, studio.org_id, "cover_file_id")()
    await _sweep()
    assert not await _exists(db_async, row.id)


async def test_a_removed_photograph_re_added_before_the_sweep_is_kept(
    db_async: AsyncSession, store: FakeStore, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    row = await _upload(db_async, studio.org_id, purpose="booking-gallery")
    first = await async_client.post(
        f"{API}/org/gallery", headers=studio.headers, json={"file_id": str(row.id)}
    )
    await async_client.delete(
        f"{API}/org/gallery/{first.json()['id']}", headers=studio.headers
    )
    again = await async_client.post(
        f"{API}/org/gallery", headers=studio.headers, json={"file_id": str(row.id)}
    )
    assert again.status_code == 201, again.text

    await _sweep()

    assert await _exists(db_async, row.id)
    assert row.object_key not in store.deleted


# --- race and resumability ----------------------------------------------------------------


async def test_an_attach_in_flight_blocks_the_sweep_until_it_commits(
    db_async: AsyncSession, store: FakeStore
) -> None:
    """The attach path locks the upload in its own transaction (FOR SHARE). While that
    transaction is open the sweep skips the file, and once the reference commits it is kept."""
    org = await make_org(db_async, "Race")
    row = await _upload(db_async, org.id, purpose="booking-gallery")
    async with async_session_factory() as attaching:
        assert await uploads.lock_usable(
            attaching,
            row.id,
            organisation_id=org.id,
            purpose="booking-gallery",
        )
        attaching.add(
            GalleryPhoto(organisation_id=org.id, file_id=row.id, sort_order=0)
        )
        await attaching.flush()

        during = await _sweep()
        assert during.swept == 0
        assert row.object_key not in store.deleted

        await attaching.commit()

    after = await _sweep()
    assert after.swept == 0
    assert await _exists(db_async, row.id)


async def test_a_batch_that_fails_leaves_nothing_half_done_and_a_rerun_finishes(
    db_async: AsyncSession, store: FakeStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = await make_org(db_async, "Resume")
    rows = [await _upload(db_async, org.id, purpose="booking-logo") for _ in range(5)]
    real = sweep._still_referenced
    calls = {"n": 0}

    async def fail_second_batch(session: AsyncSession, ids: list[uuid.UUID]) -> set:
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("database went away")
        return await real(session, ids)

    monkeypatch.setattr(sweep, "_still_referenced", fail_second_batch)
    with pytest.raises(RuntimeError):
        await _sweep(batch_size=2)

    gone = [r for r in rows if not await _exists(db_async, r.id)]
    assert len(gone) == 2, "only the first committed batch may be gone"
    assert set(store.deleted) == {r.object_key for r in gone}

    monkeypatch.setattr(sweep, "_still_referenced", real)
    rerun = await _sweep(batch_size=2)
    assert rerun.swept == 3
    assert [r.id for r in rows if await _exists(db_async, r.id)] == []


async def test_a_second_run_finds_nothing_to_do(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Idempotent")
    await _upload(db_async, org.id, purpose="booking-cover")

    first = await _sweep()
    second = await _sweep()

    assert first.swept >= 1
    assert second.swept == 0


async def test_batches_commit_one_at_a_time(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Batches")
    rows = [await _upload(db_async, org.id, purpose="booking-logo") for _ in range(5)]

    result = await _sweep(batch_size=2)

    assert result.swept == 5
    assert result.batches == 3
    assert [await _exists(db_async, r.id) for r in rows] == [False] * 5


async def test_a_failed_object_delete_is_counted_and_does_not_fail_the_run(
    db_async: AsyncSession, store: FakeStore
) -> None:
    org = await make_org(db_async, "Storage down")
    row = await _upload(db_async, org.id, purpose="booking-logo")
    store.fail_deletes = True

    result = await _sweep()

    assert result.objects_failed == 1
    assert not await _exists(db_async, row.id)


async def test_an_unexpected_delete_error_skips_one_object_and_logs_its_key(
    db_async: AsyncSession,
    store: FakeStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A non-storage error on one object must not abandon the committed batch: the
    other objects are still deleted, and the failed key is logged for a human."""
    org = await make_org(db_async, "Odd error")
    rows = [await _upload(db_async, org.id, purpose="booking-logo") for _ in range(3)]
    doomed = rows[1].object_key
    real_delete = store.delete_object

    def delete(key: str) -> None:
        if key == doomed:
            raise RuntimeError("unexpected")
        real_delete(key)

    warnings: list[tuple[object, ...]] = []

    class Recorder:
        def warning(self, message: str, *args: object, **_kwargs: object) -> None:
            warnings.append(args)

        def info(self, *_args: object, **_kwargs: object) -> None:
            return None

    # Capture on the module logger itself (the repo's convention; caplog depends on order).
    monkeypatch.setattr(sweep, "logger", Recorder())
    monkeypatch.setattr(store, "delete_object", delete)
    result = await _sweep(batch_size=10)

    assert result.swept == 3
    assert result.objects_failed == 1
    assert {r.object_key for r in rows} - {doomed} <= set(store.deleted)
    assert doomed not in store.deleted
    assert any(doomed in args for args in warnings), "the failed key was not logged"


async def test_without_storage_the_sweep_does_nothing(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = await make_org(db_async, "Unconfigured")
    row = await _upload(db_async, org.id, purpose="booking-logo")
    monkeypatch.setattr(FakeStore, "is_configured", property(lambda _self: False))

    result = await _sweep()

    assert result == sweep.SweepResult()
    assert await _exists(db_async, row.id)


# --- the reference registry ----------------------------------------------------------------


def test_every_upload_id_column_in_the_schema_is_a_registered_reference() -> None:
    """A new column that stores an upload id fails here until the sweep checks it."""
    import_all_models()
    registered = {
        (column.table.fullname, column.name)
        for column in (attr.property.columns[0] for attr in sweep.reference_columns())
    }
    found = {
        (table.fullname, column.name)
        for table in Base.metadata.sorted_tables
        for column in table.columns
        if column.name.endswith("file_id")
    }
    assert found == registered


def test_the_sweep_job_is_scheduled_hourly_and_monitored() -> None:
    from src.worker import main

    assert main.sweep_booking_uploads in main.WorkerSettings.functions
    assert hasattr(main.sweep_booking_uploads, "__wrapped__")
    assert any(
        job.coroutine is main.sweep_booking_uploads and job.minute == 20
        for job in main.WorkerSettings.cron_jobs
    )


async def test_the_job_fails_when_every_storage_delete_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rows already gone and every file still in storage is an outage: the job must be
    recorded as failed. A partial failure is only logged, and the job still succeeds."""
    from src import operational_metrics
    from src.worker import main

    recorded: list[tuple[str, bool]] = []

    async def record(_: object, name: str, __: str, success: bool) -> None:
        recorded.append((name, success))

    monkeypatch.setattr(operational_metrics, "record_job", record)

    async def all_failed(_session: object) -> sweep.SweepResult:
        return sweep.SweepResult(swept=2, batches=1, objects_failed=2)

    monkeypatch.setattr(sweep, "sweep_unreferenced", all_failed)
    with pytest.raises(RuntimeError):
        await main.sweep_booking_uploads({"job_id": "t"})
    assert recorded == [("sweep_booking_uploads", False)]

    async def partly_failed(_session: object) -> sweep.SweepResult:
        return sweep.SweepResult(swept=2, batches=1, objects_failed=1)

    monkeypatch.setattr(sweep, "sweep_unreferenced", partly_failed)
    recorded.clear()
    assert await main.sweep_booking_uploads({"job_id": "t"}) == 2
    assert recorded == [("sweep_booking_uploads", True)]


def test_the_sweep_is_registered_as_a_tracked_job() -> None:
    from src import operational_metrics

    assert "sweep_booking_uploads" in operational_metrics.JOBS
