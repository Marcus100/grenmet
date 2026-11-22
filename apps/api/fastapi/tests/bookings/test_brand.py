"""The business brand in booking emails: accent colour and logo (issue #1622).

The studio sets ``brand_color`` (``#rrggbb``) and ``logo_file_id`` (a completed
``booking-logo`` upload) on the profile. Every booking mail carries them: the accent
colours the chip and buttons, the logo sits at the top of the card with the business
name as alt text, and a colour too pale for white text falls back to the Barrels navy.
"""

import uuid
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.bookings import emails
from src.bookings.models import BookingProfile
from src.config import settings
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole
from src.storage.models import OrgUpload
from src.utils.datetime import utc_now
from tests.bookings.test_public_bookings import (
    API,
    MANAGE,
    Studio,
    _book,
    _booked,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API_BASE = "https://api.example.test"
PUBLIC_LOGO = f"{API_BASE}/api/v1/storage/public/"
BLUE = "#2563eb"
PALE = "#ffff00"
TZ = ZoneInfo("America/Grenada")


def _put(studio: Studio, **fields: object) -> dict[str, object]:
    return {
        "public_slug": studio.slug,
        "display_name": "Babydoll Beauty Bar",
        **fields,
    }


async def _logo(
    db: AsyncSession, org_id: str, *, purpose: str = "booking-logo"
) -> uuid.UUID:
    """A completed upload row; the bytes are not needed to check the link."""
    file_id = uuid.uuid4()
    db.add(
        OrgUpload(
            id=file_id,
            organisation_id=org_id,
            app="bookings" if purpose == "booking-logo" else "events",
            purpose=purpose,
            object_key=f"org/{org_id}/test/{file_id}.jpg",
            content_type="image/jpeg",
            size_bytes=1024,
            status="complete",
            created_by_user_id=None,
            created_at=utc_now(),
            expires_at=utc_now(),
            completed_at=utc_now(),
        )
    )
    await db.commit()
    return file_id


# --- the profile API -------------------------------------------------------------------


async def test_brand_colour_is_stored_lower_case_and_read_back(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, brand_color="#0B63EE")
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["brand_color"] == "#0b63ee"
    assert profile.json()["logo_file_id"] is None


@pytest.mark.parametrize("bad", ["red", "#fff", "#0b63ee00", "0b63ee", "#gggggg"])
async def test_an_invalid_brand_colour_is_422(
    db_async: AsyncSession, async_client: httpx.AsyncClient, bad: str
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_put(studio, brand_color=bad)
    )
    assert response.status_code == 422, response.text
    assert "brand_color" in response.text


async def test_a_blank_brand_colour_clears_it_and_leaving_it_out_keeps_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, brand_color=BLUE)

    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_put(studio)
    )
    assert kept.json()["brand_color"] == BLUE

    cleared = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, brand_color="  "),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["brand_color"] is None


async def test_a_logo_must_be_a_finished_upload_of_this_business(
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
    mine = await _logo(db_async, studio.org_id)
    events_logo = await _logo(db_async, studio.org_id, purpose="organiser-logo")
    theirs = await _logo(db_async, other.id)

    for not_usable in (uuid.uuid4(), events_logo, theirs):
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json=_put(studio, logo_file_id=str(not_usable)),
        )
        assert response.status_code == 409, response.text

    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, logo_file_id=str(mine)),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["logo_file_id"] == str(mine)

    # Left out keeps it; null clears it.
    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_put(studio)
    )
    assert kept.json()["logo_file_id"] == str(mine)
    cleared = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, logo_file_id=None),
    )
    assert cleared.json()["logo_file_id"] is None


async def test_a_member_cannot_change_the_brand(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, brand_color=BLUE)
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
        json=_put(studio, brand_color="#000000"),
    )
    assert response.status_code == 403, response.text


# --- the mail ----------------------------------------------------------------------------


async def test_booking_mail_carries_the_brand_and_the_logo(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    logo = await _logo(db_async, studio.org_id)
    # A full profile body: a PUT that names only some fields resets the rest (enabled).
    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 365,
            "cancel_cutoff_hours": 24,
            "notify_email": "studio@example.com",
            "manage_url_template": MANAGE,
            "brand_color": BLUE,
            "logo_file_id": str(logo),
        },
    )
    assert saved.status_code == 200, saved.text
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text

    props = [row.payload["props"] for row in await _emails(db_async, studio.org_id)]
    assert props, "the booking mail was queued"
    for mail in props:
        assert mail["accent"] == BLUE
        assert mail["logo"] == {
            "url": f"{PUBLIC_LOGO}{logo}",
            "alt": "Babydoll Beauty Bar",
        }


async def test_a_pale_brand_falls_back_to_navy_in_the_mail(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _receipt, _slots = await _booked(db_async, async_client, brand_color=PALE)
    props = [row.payload["props"] for row in await _emails(db_async, studio.org_id)]
    assert props
    assert all(mail["accent"] == layout.NAVY for mail in props)
    assert all(mail["logo"] is None for mail in props)


def test_no_logo_without_a_public_api_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", None)
    assert emails.business_logo("Studio", uuid.uuid4()) is None


def test_a_logo_needs_a_name_and_a_file() -> None:
    assert emails.business_logo("Studio", None) is None


def test_the_logo_card_shows_the_name_in_alt_text_and_the_text() -> None:
    mail = emails.BookingEmail(
        business="Studio",
        customer_name="Ann Example",
        service_name="Trim",
        provider_name="Alex",
        starts_at=utc_now(),
        tz=TZ,
        manage_url="https://studio.example.test/manage/x",
        accent=BLUE,
        logo=layout.Logo(f"{PUBLIC_LOGO}abc", alt="Studio"),
    )
    card = emails.customer_confirmed(mail)
    html = layout.render_html(card)
    assert f'src="{PUBLIC_LOGO}abc" alt="Studio"' in html
    assert BLUE in html
    # Images blocked: the business name is still in the text of the mail.
    assert "Studio" in layout.render_text(card)


def test_a_mail_without_a_brand_uses_navy_and_no_image() -> None:
    mail = emails.BookingEmail(
        business="Studio",
        customer_name="Ann Example",
        service_name="Trim",
        provider_name="Alex",
        starts_at=utc_now(),
        tz=TZ,
    )
    html = layout.render_html(emails.customer_confirmed(mail))
    assert "<img" not in html
    assert layout.NAVY in html


# --- the public storefront (issue #1622, web follow-up) ----------------------------------


async def _brand_profile(
    client: httpx.AsyncClient, studio: Studio, **fields: object
) -> httpx.Response:
    """A full profile body: a PUT that names only some fields resets the rest."""
    return await client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 365,
            "cancel_cutoff_hours": 24,
            "notify_email": "studio@example.com",
            "manage_url_template": MANAGE,
            **fields,
        },
    )


async def _storefront(client: httpx.AsyncClient, studio: Studio) -> dict[str, object]:
    response = await client.get(f"{API}/public/{studio.slug}")
    assert response.status_code == 200, response.text
    return response.json()


async def test_storefront_without_colour_or_logo_says_so(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client)
    body = await _storefront(async_client, studio)
    assert body["brand_color"] is None
    assert body["logo_url"] is None


async def test_storefront_carries_the_colour_and_the_public_logo_url(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color="#0B63EE")
    logo = await _logo(db_async, studio.org_id)
    saved = await _brand_profile(
        async_client, studio, brand_color="#0B63EE", logo_file_id=str(logo)
    )
    assert saved.status_code == 200, saved.text

    body = await _storefront(async_client, studio)
    assert body["brand_color"] == "#0b63ee"
    assert body["logo_url"] == f"{PUBLIC_LOGO}{logo}"


async def test_storefront_colour_without_logo(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    body = await _storefront(async_client, studio)
    assert body["brand_color"] == BLUE
    assert body["logo_url"] is None


async def test_storefront_hides_a_logo_that_is_not_a_complete_business_upload(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    owner = await make_user(db_async)
    other = await make_org(
        db_async,
        "Other Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    mine = await _logo(db_async, studio.org_id)
    events_logo = await _logo(db_async, studio.org_id, purpose="organiser-logo")
    theirs = await _logo(db_async, other.id)
    pending = await _logo(db_async, studio.org_id)
    assert (
        await _brand_profile(async_client, studio, logo_file_id=str(mine))
    ).status_code == 200

    # The stored pointer is changed directly, as a later upload or a stale row could.
    for stored in (events_logo, theirs, uuid.uuid4()):
        await db_async.execute(
            update(BookingProfile)
            .where(BookingProfile.organisation_id == studio.org_id)
            .values(logo_file_id=stored)
        )
        await db_async.commit()
        assert (await _storefront(async_client, studio))["logo_url"] is None

    await db_async.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(logo_file_id=pending)
    )
    await db_async.execute(
        update(OrgUpload).where(OrgUpload.id == pending).values(status="pending")
    )
    await db_async.commit()
    assert (await _storefront(async_client, studio))["logo_url"] is None


async def test_storefront_logo_needs_an_https_api_address(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", "http://localhost:8000")
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    logo = await _logo(db_async, studio.org_id)
    assert (
        await _brand_profile(async_client, studio, logo_file_id=str(logo))
    ).status_code == 200
    body = await _storefront(async_client, studio)
    assert body["logo_url"] is None
    assert body["brand_color"] == BLUE


async def test_storefront_has_no_logo_without_a_public_api_address(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    logo = await _logo(db_async, studio.org_id)
    assert (
        await _brand_profile(async_client, studio, logo_file_id=str(logo))
    ).status_code == 200
    monkeypatch.setattr(settings, "API_BASE_URL", None)
    body = await _storefront(async_client, studio)
    assert body["logo_url"] is None
    assert body["brand_color"] == BLUE


async def test_unknown_and_disabled_pages_still_answer_one_404_with_no_brand(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _studio(db_async, async_client, brand_color=BLUE)
    logo = await _logo(db_async, studio.org_id)
    assert (
        await _brand_profile(async_client, studio, logo_file_id=str(logo))
    ).status_code == 200
    assert (
        await _brand_profile(async_client, studio, enabled=False)
    ).status_code == 200

    disabled = await async_client.get(f"{API}/public/{studio.slug}")
    unknown = await async_client.get(f"{API}/public/nobody-here-{uuid.uuid4().hex[:6]}")
    assert disabled.status_code == 404
    assert unknown.status_code == 404
    assert disabled.json() == unknown.json()
    assert "brand_color" not in disabled.text
    assert "logo" not in disabled.text
