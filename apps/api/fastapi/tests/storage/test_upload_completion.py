"""Completion of a presigned upload: the row lock, and the original key deleted only
after the commit (#1679 review). Uses the byte-keeping store from test_booking_logo.
"""

import asyncio
import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory
from src.organisations.models import MembershipRole
from src.storage import uploads
from src.storage.models import OrgUpload
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.storage.test_booking_logo import (  # noqa: F401 (byte_store is a fixture)
    ByteStore,
    _jpeg_with_location,
    _upload,
    byte_store,
)

UPLOADS = "/api/v1/storage/uploads"


async def _bookings_owner(db: AsyncSession, name: str):
    owner = await make_user(db)
    org = await make_org(
        db, name, members=((owner, MembershipRole.OWNER),), apps=("bookings",)
    )
    return owner, org


async def test_two_concurrent_completions_write_one_served_copy(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    """Completion locks the row: the second call waits, then sees it complete and
    writes nothing."""
    owner, org = await _bookings_owner(db_async, "Race Co")
    headers = headers_for(owner, org.id)
    upload_id, _ = await _upload(
        async_client, byte_store, headers, _jpeg_with_location()
    )
    served_writes: list[str] = []
    real_put = byte_store.put_object

    def counting_put(key: str, data: bytes, *, content_type: str | None = None) -> None:
        served_writes.append(key)
        real_put(key, data, content_type=content_type)

    byte_store.put_object = counting_put  # type: ignore[method-assign]
    first, second = await asyncio.gather(
        async_client.post(f"{UPLOADS}/{upload_id}/complete", headers=headers),
        async_client.post(f"{UPLOADS}/{upload_id}/complete", headers=headers),
    )

    assert (first.status_code, second.status_code) == (200, 200)
    assert first.json()["status"] == second.json()["status"] == "complete"
    assert len(served_writes) == 1


async def test_a_failed_commit_keeps_the_original_so_a_retry_works(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    byte_store: ByteStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The original key is deleted only after the commit. If the commit fails, the row
    still points at the original and a retry completes it."""
    owner, org = await _bookings_owner(db_async, "Retry Co")
    headers = headers_for(owner, org.id)
    raw = _jpeg_with_location()
    upload_id, original_key = await _upload(async_client, byte_store, headers, raw)
    armed = {"next": False}
    real_commit = AsyncSession.commit

    async def commit(self: AsyncSession) -> None:
        if armed["next"]:
            armed["next"] = False
            raise RuntimeError("database went away")
        await real_commit(self)

    monkeypatch.setattr(AsyncSession, "commit", commit)

    armed["next"] = True
    with pytest.raises(RuntimeError, match="database went away"):
        await async_client.post(f"{UPLOADS}/{upload_id}/complete", headers=headers)

    async with async_session_factory() as fresh:
        row = await fresh.get(OrgUpload, uuid.UUID(upload_id))
    assert row is not None
    assert (row.status, row.object_key) == ("pending", original_key)
    assert byte_store.blobs[original_key] == raw

    retry = await async_client.post(f"{UPLOADS}/{upload_id}/complete", headers=headers)
    assert retry.status_code == 200, retry.text
    assert original_key not in byte_store.blobs


async def test_the_original_is_discarded_after_the_commit(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    byte_store: ByteStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, org = await _bookings_owner(db_async, "Order Co")
    headers = headers_for(owner, org.id)
    upload_id, _ = await _upload(
        async_client, byte_store, headers, _jpeg_with_location()
    )
    events: list[str] = []
    real_commit = AsyncSession.commit
    real_discard = uploads.discard_superseded_object

    async def commit(self: AsyncSession) -> None:
        events.append("commit")
        await real_commit(self)

    async def discard(key: str) -> None:
        events.append("discard")
        await real_discard(key)

    monkeypatch.setattr(AsyncSession, "commit", commit)
    monkeypatch.setattr(uploads, "discard_superseded_object", discard)

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text
    assert events.count("discard") == 1
    assert events[-1] == "discard"
    assert "commit" in events[:-1]
