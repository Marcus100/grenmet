"""A product's private files need that product's read key (#1925).

`GET /storage/files/{id}` used to hand a short-lived link to any completed private
upload to any active member of the organisation. For the airport operations photos the
file id appears only inside records a member was allowed to read, so a member who had
since lost the key could still fetch a photo whose id they once saw.
"""

import uuid
from collections.abc import Iterator

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import grants
from src.organisations.models import Membership, MembershipGrant, MembershipRole
from src.storage import service as storage
from src.storage import uploads
from tests.factories import make_user
from tests.incidents.test_attachments_and_links import _grant, _upload
from tests.organisations.support import headers_for, make_org
from tests.storage.test_uploads import FakeStore


@pytest.fixture(autouse=True)
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStore]:
    fake = FakeStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


class Airport:
    """One organisation with a member for each situation worth distinguishing."""

    def __init__(self) -> None:
        self.org_id = ""
        self.owner = None
        self.writer = None
        self.responder = None
        self.plain = None
        self.ex_writer = None


async def _airport(db: AsyncSession) -> Airport:
    a = Airport()
    a.owner = await make_user(db)
    a.writer = await make_user(db)
    a.responder = await make_user(db)
    a.plain = await make_user(db)
    a.ex_writer = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=(
            (a.owner, MembershipRole.OWNER),
            (a.writer, MembershipRole.MEMBER),
            (a.responder, MembershipRole.MEMBER),
            (a.plain, MembershipRole.MEMBER),
            (a.ex_writer, MembershipRole.MEMBER),
        ),
        apps=("opslog", "incidents"),
    )
    a.org_id = org.id
    await _grant(db, org.id, a.writer, "opslog-writer")
    await _grant(db, org.id, a.responder, "incidents-responder")
    await _grant(db, org.id, a.ex_writer, "opslog-writer")
    return a


async def _read(client: httpx.AsyncClient, airport: Airport, user, file_id) -> int:
    response = await client.get(
        f"/api/v1/storage/files/{file_id}", headers=headers_for(user, airport.org_id)
    )
    return response.status_code


async def _photos(db: AsyncSession, a: Airport) -> tuple[uuid.UUID, uuid.UUID]:
    ops = await _upload(db, a.org_id, a.owner, app="opslog", purpose="opslog-photo")
    incident = await _upload(
        db, a.org_id, a.owner, app="incidents", purpose="incident-photo"
    )
    return ops, incident


async def test_the_owner_holds_every_product_key_so_reads_both(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _airport(db_async)
    ops, incident = await _photos(db_async, a)

    assert await _read(async_client, a, a.owner, ops) == 200
    assert await _read(async_client, a, a.owner, incident) == 200


async def test_a_member_with_the_product_key_reads_that_products_photos(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _airport(db_async)
    ops, incident = await _photos(db_async, a)

    assert await _read(async_client, a, a.writer, ops) == 200
    assert await _read(async_client, a, a.responder, incident) == 200


async def test_one_products_key_does_not_open_the_others_photos(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _airport(db_async)
    ops, incident = await _photos(db_async, a)

    assert await _read(async_client, a, a.writer, incident) == 404
    assert await _read(async_client, a, a.responder, ops) == 404


async def test_a_member_with_no_product_key_reads_neither(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _airport(db_async)
    ops, incident = await _photos(db_async, a)

    assert await _read(async_client, a, a.plain, ops) == 404
    assert await _read(async_client, a, a.plain, incident) == 404


async def test_a_member_who_lost_the_key_can_no_longer_fetch_a_photo_they_saw(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The case in the issue: they saw the id while they held the key."""
    a = await _airport(db_async)
    ops, _ = await _photos(db_async, a)
    assert await _read(async_client, a, a.ex_writer, ops) == 200

    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == a.org_id, Membership.user_id == a.ex_writer.id
        )
    )
    assert membership is not None
    await db_async.execute(
        delete(MembershipGrant).where(
            MembershipGrant.organisation_id == a.org_id,
            MembershipGrant.membership_id == membership.id,
        )
    )
    await db_async.commit()

    assert await _read(async_client, a, a.ex_writer, ops) == 404


async def test_refusal_looks_the_same_as_a_file_that_is_not_there(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """404 with the same body, so a member without the key learns nothing about
    whether a file exists."""
    a = await _airport(db_async)
    ops, _ = await _photos(db_async, a)
    headers = headers_for(a.plain, a.org_id)

    gated = await async_client.get(f"/api/v1/storage/files/{ops}", headers=headers)
    missing = await async_client.get(
        f"/api/v1/storage/files/{uuid.uuid4()}", headers=headers
    )

    assert gated.status_code == missing.status_code == 404
    assert gated.json() == missing.json()


async def test_purposes_without_a_read_key_behave_as_before(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Events and Bookings files are still readable by any active member."""
    a = await _airport(db_async)
    gallery = await _upload(
        db_async, a.org_id, a.owner, app="bookings", purpose="booking-gallery"
    )

    assert await _read(async_client, a, a.plain, gallery) == 200


async def test_a_file_whose_purpose_is_no_longer_known_is_refused_even_to_the_owner(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Fail closed: a removed or renamed purpose must not turn its private files into
    "readable by any member"."""
    a = await _airport(db_async)
    orphan = await _upload(
        db_async, a.org_id, a.owner, app="opslog", purpose="a-purpose-that-was-removed"
    )

    assert await _read(async_client, a, a.owner, orphan) == 404
    assert await _read(async_client, a, a.plain, orphan) == 404


def test_every_private_purpose_names_a_read_key() -> None:
    """A new private purpose with no read key would fall back to "any member", which is
    the gap this closes. Making that a deliberate choice, not an omission."""
    for name, purpose in uploads.PURPOSES.items():
        if not purpose.public:
            assert purpose.read_key is not None, name


def test_every_read_key_is_a_real_product_key() -> None:
    """A typo would make the gate refuse everyone, including the owner."""
    for name, purpose in uploads.PURPOSES.items():
        if purpose.read_key is not None:
            assert grants.is_product_key(purpose.read_key), name
