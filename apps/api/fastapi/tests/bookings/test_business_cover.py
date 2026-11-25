"""Cover photo for a booking business (a wide picture for the home page and storefront).

``profile.cover_file_id`` names a completed ``booking-cover`` upload of the same
business, like the logo. Completion strips its metadata and refuses an image over
8 megapixels. ``cover_url`` (storefront and home page cards) is the https public
address while that file is still a complete cover of the business, else null.
"""

import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import service
from src.config import settings
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole
from src.storage import service as storage
from src.storage.models import OrgUpload
from src.storage.schemas import UploadRequest
from src.storage.uploads import (
    BOOKING_COVER_MAX_PIXELS,
    UploadRejectedError,
    validate_request,
)
from src.utils.datetime import utc_now
from tests.bookings.test_public_bookings import API, MANAGE, Studio, _studio
from tests.bookings.test_public_listing import _business
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.storage.test_booking_logo import (
    ByteStore,
    _flat_png,
    _jpeg_with_location,
    _metadata_of,
    _upload,
)

API_BASE = "https://api.example.test"
PUBLIC_FILES = f"{API_BASE}/api/v1/storage/public/"
UPLOADS = "/api/v1/storage/uploads"


@pytest.fixture
def byte_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[ByteStore]:
    fake = ByteStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


async def _file(
    db: AsyncSession,
    org_id: str,
    *,
    purpose: str = "booking-cover",
    status: str = "complete",
) -> uuid.UUID:
    """A file row of the given purpose; the bytes are not needed to check the link."""
    file_id = uuid.uuid4()
    app = "events" if purpose == "organiser-logo" else "bookings"
    db.add(
        OrgUpload(
            id=file_id,
            organisation_id=org_id,
            app=app,
            purpose=purpose,
            object_key=f"org/{org_id}/{app}/{purpose}/{file_id}.jpg",
            content_type="image/jpeg",
            size_bytes=1024,
            status=status,
            created_by_user_id=None,
            created_at=utc_now(),
            expires_at=utc_now(),
            completed_at=utc_now() if status == "complete" else None,
        )
    )
    await db.commit()
    return file_id


def _body(studio: Studio, **fields: object) -> dict[str, Any]:
    # A full profile body: a PUT that names only some fields resets the rest (enabled).
    return {
        "public_slug": studio.slug,
        "display_name": "Babydoll Beauty Bar",
        "enabled": True,
        "lead_time_min": 0,
        "horizon_days": 365,
        "cancel_cutoff_hours": 24,
        "notify_email": "studio@example.com",
        "manage_url_template": MANAGE,
        **fields,
    }


# --- the upload purpose ----------------------------------------------------------------


def test_a_booking_cover_is_an_image_for_the_bookings_app_only() -> None:
    purpose = validate_request(
        UploadRequest(
            app="bookings",
            purpose="booking-cover",
            content_type="image/webp",
            size_bytes=1024,
        )
    )
    assert purpose.strip_metadata is True
    assert purpose.public is True
    assert purpose.max_pixels == BOOKING_COVER_MAX_PIXELS == 8_000_000

    with pytest.raises(UploadRejectedError, match="does not belong to this app"):
        validate_request(
            UploadRequest(
                app="events",
                purpose="booking-cover",
                content_type="image/png",
                size_bytes=1024,
            )
        )


async def test_completing_a_cover_strips_its_metadata(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Cover Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    raw = _jpeg_with_location()
    upload_id, key = await _upload(
        async_client, byte_store, headers, raw, purpose="booking-cover"
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text
    row = await db_async.get(OrgUpload, uuid.UUID(upload_id))
    assert row is not None
    stored = byte_store.blobs[row.object_key]  # the served copy (#1679)
    assert stored != raw
    assert _metadata_of(stored)[2] == 0
    assert b"Phone Maker" not in stored


async def test_a_cover_over_eight_megapixels_is_422_and_deleted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Wide Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    upload_id, key = await _upload(
        async_client,
        byte_store,
        headers,
        _flat_png(3000, 3000),  # 9 megapixels
        purpose="booking-cover",
        content_type="image/png",
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 422, response.text
    assert "too many pixels" in response.text
    assert key not in byte_store.blobs


async def test_a_cover_of_just_under_eight_megapixels_is_accepted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Panorama Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    upload_id, _key = await _upload(
        async_client,
        byte_store,
        headers,
        _flat_png(2800, 2800),  # 7.84 megapixels
        purpose="booking-cover",
        content_type="image/png",
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text


# --- the profile -----------------------------------------------------------------------


async def test_a_cover_must_be_a_finished_booking_cover_of_this_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    owner = await make_user(db_async)
    other = await make_org(
        db_async,
        "Other Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    logo = await _file(db_async, studio.org_id, purpose="booking-logo")
    events_logo = await _file(db_async, studio.org_id, purpose="organiser-logo")
    pending = await _file(db_async, studio.org_id, status="pending")
    theirs = await _file(db_async, other.id)

    for not_usable in (uuid.uuid4(), logo, events_logo, pending, theirs):
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json=_body(studio, cover_file_id=str(not_usable)),
        )
        assert response.status_code == 409, response.text


async def test_a_cover_is_set_kept_and_cleared_like_the_logo(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    cover = await _file(db_async, studio.org_id)

    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=str(cover)),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["cover_file_id"] == str(cover)

    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_body(studio)
    )
    assert kept.json()["cover_file_id"] == str(cover)

    cleared = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=None),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["cover_file_id"] is None


async def test_a_member_cannot_set_the_cover(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    member = await make_user(db_async)
    await organisation_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    cover = await _file(db_async, studio.org_id)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=headers_for(member, studio.org_id),
        json=_body(studio, cover_file_id=str(cover)),
    )
    assert response.status_code == 403, response.text


async def test_cover_url_is_null_until_a_cover_is_set(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["cover_url"] is None

    listing = await async_client.get(f"{API}/public/businesses")
    card = next(item for item in listing.json()["items"] if item["slug"] == studio.slug)
    assert card["cover_url"] is None


async def test_cover_url_is_the_public_address_once_a_cover_is_set(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    cover = await _file(db_async, studio.org_id)
    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=str(cover)),
    )
    assert saved.status_code == 200, saved.text

    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.json()["cover_url"] == f"{PUBLIC_FILES}{cover}"
    listing = await async_client.get(f"{API}/public/businesses")
    card = next(item for item in listing.json()["items"] if item["slug"] == studio.slug)
    assert card["cover_url"] == f"{PUBLIC_FILES}{cover}"


async def test_cover_url_is_null_when_the_file_is_no_longer_complete(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client)
    cover = await _file(db_async, studio.org_id)
    await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=str(cover)),
    )
    row = await db_async.get(OrgUpload, cover)
    assert row is not None
    row.status = "pending"
    row.completed_at = None
    await db_async.commit()

    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["cover_url"] is None


async def test_cover_url_is_null_without_a_public_api_address(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", None)
    studio = await _studio(db_async, async_client)
    cover = await _file(db_async, studio.org_id)
    await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=str(cover)),
    )
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.json()["cover_url"] is None


async def test_a_failing_cover_check_fails_closed_on_the_storefront(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client)
    cover = await _file(db_async, studio.org_id)
    await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, cover_file_id=str(cover)),
    )

    async def broken(_session: AsyncSession, _profile: object) -> bool:
        raise RuntimeError("connection pool exhausted")

    monkeypatch.setattr(service, "_cover_is_complete", broken)
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["cover_url"] is None
    assert storefront.json()["display_name"] == "Babydoll Beauty Bar"
