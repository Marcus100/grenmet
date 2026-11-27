"""The richer business page, slice 1: an "about" text and a gallery of the work.

``profile.about`` is plain text (at most 1000 characters), kept unless the PUT names
it, and public on the storefront. ``bookings.gallery_photo`` holds up to 12
photographs, each a completed ``booking-gallery`` upload of the same business, in the
order the business arranged; removing one closes the gap it leaves. The storefront's
``gallery`` carries the https public address of each photograph that is still a
complete upload, and is empty when there is none.
"""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import gallery
from src.config import settings
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole
from src.storage.models import OrgUpload
from src.storage.schemas import UploadRequest
from src.storage.uploads import (
    BOOKING_GALLERY_MAX_PIXELS,
    UploadRejectedError,
    validate_request,
)
from tests.bookings.test_business_cover import API_BASE, PUBLIC_FILES, _body, _file
from tests.bookings.test_public_bookings import API, Studio, _studio
from tests.bookings.test_public_listing import _business
from tests.factories import make_user
from tests.organisations.support import headers_for

GALLERY = f"{API}/org/gallery"


async def _photo(client: httpx.AsyncClient, studio: Studio, file_id: uuid.UUID) -> dict:
    response = await client.post(
        GALLERY, headers=studio.headers, json={"file_id": str(file_id)}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _gallery_file(db: AsyncSession, org_id: str) -> uuid.UUID:
    return await _file(db, org_id, purpose="booking-gallery")


# --- the upload purpose ----------------------------------------------------------------


def test_a_booking_gallery_photo_is_an_image_for_the_bookings_app_only() -> None:
    purpose = validate_request(
        UploadRequest(
            app="bookings",
            purpose="booking-gallery",
            content_type="image/webp",
            size_bytes=1024,
        )
    )
    assert purpose.strip_metadata is True
    assert purpose.public is True
    assert purpose.max_bytes == 5 * 1024 * 1024
    assert purpose.max_pixels == BOOKING_GALLERY_MAX_PIXELS == 8_000_000

    with pytest.raises(UploadRejectedError, match="does not belong to this app"):
        validate_request(
            UploadRequest(
                app="events",
                purpose="booking-gallery",
                content_type="image/png",
                size_bytes=1024,
            )
        )


# --- about -----------------------------------------------------------------------------


async def test_about_is_set_kept_and_cleared(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)

    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, about="We braid hair.\nWalk-ins welcome."),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["about"] == "We braid hair.\nWalk-ins welcome."

    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_body(studio)
    )
    assert kept.json()["about"] == "We braid hair.\nWalk-ins welcome."

    cleared = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_body(studio, about="  ")
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["about"] is None


async def test_about_over_a_thousand_characters_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, about="a" * 1001),
    )
    assert response.status_code == 422, response.text


async def test_about_is_plain_text_with_its_line_breaks_kept(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        # Windows line endings and a control character: the same rule as the policy.
        json=_body(studio, about="Open daily.\r\n\r\nSee you\x07 soon."),
    )
    assert response.status_code == 200, response.text
    assert response.json()["about"] == "Open daily.\n\nSee you soon."


async def test_the_storefront_carries_about(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client)
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.json()["about"] is None

    await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_body(studio, about="Twenty years of braiding."),
    )
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["about"] == "Twenty years of braiding."


async def test_a_member_cannot_write_about(
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
    response = await async_client.put(
        f"{API}/org/profile",
        headers=headers_for(member, studio.org_id),
        json=_body(studio, about="Not mine to write."),
    )
    assert response.status_code == 403, response.text


# --- the gallery in the studio ----------------------------------------------------------


async def test_a_photograph_must_be_a_finished_gallery_upload_of_this_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    other = await _studio(db_async, async_client)
    cover = await _file(db_async, studio.org_id, purpose="booking-cover")
    pending = await _file(
        db_async, studio.org_id, purpose="booking-gallery", status="pending"
    )
    theirs = await _gallery_file(db_async, other.org_id)

    for not_usable in (uuid.uuid4(), cover, pending, theirs):
        response = await async_client.post(
            GALLERY, headers=studio.headers, json={"file_id": str(not_usable)}
        )
        assert response.status_code == 409, response.text
        assert "finished upload" in response.text


async def test_photographs_are_listed_in_the_order_they_were_added(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    files = [await _gallery_file(db_async, studio.org_id) for _ in range(3)]
    added = [await _photo(async_client, studio, file_id) for file_id in files]
    assert [photo["sort_order"] for photo in added] == [0, 1, 2]

    listed = await async_client.get(GALLERY, headers=studio.headers)
    assert listed.status_code == 200, listed.text
    assert [photo["file_id"] for photo in listed.json()] == [str(f) for f in files]


async def test_adding_the_same_file_twice_answers_the_photograph_already_there(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    file_id = await _gallery_file(db_async, studio.org_id)
    first = await _photo(async_client, studio, file_id)
    again = await _photo(async_client, studio, file_id)

    assert again["id"] == first["id"]
    listed = await async_client.get(GALLERY, headers=studio.headers)
    assert len(listed.json()) == 1


async def test_a_thirteenth_photograph_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for _ in range(gallery.MAX_PHOTOS):
        await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))

    extra = await _gallery_file(db_async, studio.org_id)
    response = await async_client.post(
        GALLERY, headers=studio.headers, json={"file_id": str(extra)}
    )
    assert response.status_code == 409, response.text
    assert "at most 12 photographs" in response.text


async def test_the_business_arranges_the_order(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    added = [
        await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))
        for _ in range(3)
    ]
    wanted = [added[2]["id"], added[0]["id"], added[1]["id"]]

    response = await async_client.put(
        f"{GALLERY}/order", headers=studio.headers, json={"ids": wanted}
    )
    assert response.status_code == 200, response.text
    assert [photo["id"] for photo in response.json()] == wanted
    assert [photo["sort_order"] for photo in response.json()] == [0, 1, 2]

    listed = await async_client.get(GALLERY, headers=studio.headers)
    assert [photo["id"] for photo in listed.json()] == wanted


async def test_another_business_photograph_cannot_be_ordered_or_removed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    other = await _studio(db_async, async_client)
    mine = await _photo(
        async_client, studio, await _gallery_file(db_async, studio.org_id)
    )
    theirs = await _photo(
        async_client, other, await _gallery_file(db_async, other.org_id)
    )

    ordered = await async_client.put(
        f"{GALLERY}/order",
        headers=studio.headers,
        json={"ids": [theirs["id"], mine["id"]]},
    )
    assert ordered.status_code == 404, ordered.text

    removed = await async_client.delete(
        f"{GALLERY}/{theirs['id']}", headers=studio.headers
    )
    assert removed.status_code == 404, removed.text


async def test_removing_a_photograph_leaves_no_hole_in_the_order(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    added = [
        await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))
        for _ in range(4)
    ]

    removed = await async_client.delete(
        f"{GALLERY}/{added[1]['id']}", headers=studio.headers
    )
    assert removed.status_code == 204, removed.text

    listed = await async_client.get(GALLERY, headers=studio.headers)
    photos = listed.json()
    assert [photo["id"] for photo in photos] == [
        added[0]["id"],
        added[2]["id"],
        added[3]["id"],
    ]
    assert [photo["sort_order"] for photo in photos] == [0, 1, 2]


async def test_a_removed_photograph_frees_a_place_in_the_gallery(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    added = [
        await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))
        for _ in range(gallery.MAX_PHOTOS)
    ]
    await async_client.delete(f"{GALLERY}/{added[0]['id']}", headers=studio.headers)

    response = await async_client.post(
        GALLERY,
        headers=studio.headers,
        json={"file_id": str(await _gallery_file(db_async, studio.org_id))},
    )
    assert response.status_code == 201, response.text
    assert response.json()["sort_order"] == gallery.MAX_PHOTOS - 1


async def test_a_member_cannot_change_the_gallery(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    photo = await _photo(
        async_client, studio, await _gallery_file(db_async, studio.org_id)
    )
    member = await make_user(db_async)
    await organisation_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers = headers_for(member, studio.org_id)

    assert (await async_client.get(GALLERY, headers=headers)).status_code == 200
    added = await async_client.post(
        GALLERY,
        headers=headers,
        json={"file_id": str(await _gallery_file(db_async, studio.org_id))},
    )
    assert added.status_code == 403, added.text
    removed = await async_client.delete(f"{GALLERY}/{photo['id']}", headers=headers)
    assert removed.status_code == 403, removed.text


# --- the gallery on the public page -----------------------------------------------------


async def test_the_storefront_gallery_is_empty_until_a_photograph_is_added(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["gallery"] == []


async def test_the_storefront_gallery_carries_each_public_address_in_order(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    files = [await _gallery_file(db_async, studio.org_id) for _ in range(2)]
    added = [await _photo(async_client, studio, file_id) for file_id in files]
    await async_client.put(
        f"{GALLERY}/order",
        headers=studio.headers,
        json={"ids": [added[1]["id"], added[0]["id"]]},
    )

    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert [image["url"] for image in storefront.json()["gallery"]] == [
        f"{PUBLIC_FILES}{files[1]}",
        f"{PUBLIC_FILES}{files[0]}",
    ]


async def test_a_photograph_whose_file_is_no_longer_complete_is_not_shown(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    kept = await _gallery_file(db_async, studio.org_id)
    gone = await _gallery_file(db_async, studio.org_id)
    await _photo(async_client, studio, kept)
    await _photo(async_client, studio, gone)
    row = await db_async.get(OrgUpload, gone)
    assert row is not None
    row.status = "pending"
    row.completed_at = None
    await db_async.commit()

    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert [image["url"] for image in storefront.json()["gallery"]] == [
        f"{PUBLIC_FILES}{kept}"
    ]


async def test_the_gallery_is_empty_without_a_public_api_address(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", None)
    studio = await _business(db_async, async_client)
    await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.json()["gallery"] == []


async def test_a_failing_gallery_read_fails_closed_on_the_storefront(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    await _photo(async_client, studio, await _gallery_file(db_async, studio.org_id))

    def broken(*_args: object, **_kwargs: object) -> object:
        raise RuntimeError("connection pool exhausted")

    # The read inside ``public_gallery`` fails; the page still answers, with no
    # gallery, and the business's own details intact.
    monkeypatch.setattr(gallery, "select", broken)

    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["gallery"] == []
    assert storefront.json()["display_name"] == "Babydoll Beauty Bar"
