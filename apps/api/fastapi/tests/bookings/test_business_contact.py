"""Business contact options on the booking profile (owner decision 15 Nov 2026).

Phone, WhatsApp, Instagram and email are optional, set by the studio, and shown
on the public booking page and the manage page so customers can reach the
business when online booking cannot help.
"""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import contact, service
from src.bookings.schemas import BookingProfileUpdate
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole
from tests.bookings.test_public_bookings import API, _book, _slots, _studio
from tests.factories import make_user
from tests.organisations.support import headers_for

ALL_FOUR = {
    "contact_phone": "+1 (473) 440-1234",
    "contact_whatsapp": "+1 473 440 5678",
    "contact_instagram": "https://www.instagram.com/babydollbeautybar/?hl=en",
    "contact_email": "hello@babydoll.example",
}
STORED = {
    "phone": "+14734401234",
    "whatsapp": "14734405678",
    "instagram": "babydollbeautybar",
    "email": "hello@babydoll.example",
}
NONE = {"phone": None, "whatsapp": None, "instagram": None, "email": None}


# --- pure normalisation ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+1 473 440 1234", "+14734401234"),
        ("+1 (473) 440-1234", "+14734401234"),
        ("001.473.440.1234", "+14734401234"),
        ("  ", None),
        ("", None),
        (None, None),
    ],
)
def test_phone_is_stored_in_e164(raw: str | None, expected: str | None) -> None:
    assert contact.normalise_phone(raw) == expected


@pytest.mark.parametrize(
    "raw", ["473 440 1234", "+0 473 440 1234", "+1 473", "call me"]
)
def test_phone_needs_a_country_code_and_digits(raw: str) -> None:
    with pytest.raises(ValueError, match="country code"):
        contact.normalise_phone(raw)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+1 473 440 1234", "14734401234"),
        ("1-473-440-1234", "14734401234"),
        ("0014734401234", "14734401234"),
        ("", None),
    ],
)
def test_whatsapp_is_stored_as_digits(raw: str, expected: str | None) -> None:
    assert contact.normalise_whatsapp(raw) == expected


@pytest.mark.parametrize("raw", ["wa.me/14734401234", "+1 473", "0473 440 1234"])
def test_whatsapp_rejects_anything_but_a_full_number(raw: str) -> None:
    with pytest.raises(ValueError, match="WhatsApp"):
        contact.normalise_whatsapp(raw)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("babydoll.beauty_bar", "babydoll.beauty_bar"),
        ("@babydollbeautybar", "babydollbeautybar"),
        ("https://www.instagram.com/babydollbeautybar/", "babydollbeautybar"),
        ("instagram.com/babydollbeautybar?igsh=abc", "babydollbeautybar"),
        ("http://instagram.com/@babydollbeautybar", "babydollbeautybar"),
        ("", None),
    ],
)
def test_instagram_is_stored_as_a_handle(raw: str, expected: str | None) -> None:
    assert contact.normalise_instagram(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "baby doll",
        "a" * 31,
        "https://evil.example/instagram.com/x",
        "https://www.instagram.com/p/abc123/",
        "https://www.instagram.com/",
    ],
)
def test_instagram_rejects_what_is_not_a_handle(raw: str) -> None:
    with pytest.raises(ValueError, match="Instagram"):
        contact.normalise_instagram(raw)


# --- studio settings ------------------------------------------------------------------


async def test_owner_saves_contacts_and_settings_return_them_normalised(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)

    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert {key: body[f"contact_{key}"] for key in STORED} == STORED

    settings = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    assert settings.status_code == 200, settings.text
    saved = settings.json()["profile"]
    assert {key: saved[f"contact_{key}"] for key in STORED} == STORED


async def test_contacts_are_optional_and_blank_clears_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)
    profile = (
        await async_client.get(f"{API}/org/profile", headers=studio.headers)
    ).json()
    cleared = {
        key: value
        for key, value in profile.items()
        if key not in {"id", "organisation_id", "created_at", "updated_at"}
    } | {
        "contact_phone": "",
        "contact_whatsapp": None,
        "contact_instagram": " ",
        "contact_email": None,
    }
    response = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=cleared
    )
    assert response.status_code == 200, response.text
    assert {key: response.json()[f"contact_{key}"] for key in STORED} == NONE


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("contact_phone", "473 440 1234"),
        ("contact_whatsapp", "not a number"),
        ("contact_instagram", "https://facebook.com/babydoll"),
        ("contact_email", "not-an-email"),
    ],
)
async def test_invalid_contacts_are_422(
    db_async: AsyncSession, async_client: httpx.AsyncClient, field: str, value: str
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            field: value,
        },
    )
    assert response.status_code == 422, response.text
    assert field in response.text


async def test_members_cannot_change_contacts(
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
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "contact_phone": "+14734401234",
        },
    )
    assert response.status_code == 403


# --- public pages ---------------------------------------------------------------------


async def test_storefront_shows_the_contacts(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)
    response = await async_client.get(f"{API}/public/{studio.slug}")
    assert response.status_code == 200, response.text
    assert response.json()["contact"] == STORED


async def test_storefront_contact_is_all_null_when_none_set(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, contact_instagram="@babydoll")
    response = await async_client.get(f"{API}/public/{studio.slug}")
    assert response.json()["contact"] == NONE | {"instagram": "babydoll"}


async def test_manage_page_carries_the_booking_businesss_contacts(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)
    slots = await _slots(async_client, studio)
    created = await _book(async_client, studio, slots[0])
    assert created.status_code == 201, created.text
    receipt = created.json()
    assert receipt["booking"]["contact"] == STORED

    token = receipt["manage_token"]
    detail = await async_client.get(f"{API}/public/bookings/{token}")
    assert detail.status_code == 200
    assert detail.json()["contact"] == STORED


async def test_another_business_contacts_never_show(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    other = await _studio(
        db_async, async_client, contact_email=f"x-{uuid.uuid4().hex[:6]}@example.com"
    )
    studio = await _studio(db_async, async_client)
    response = await async_client.get(f"{API}/public/{studio.slug}")
    assert response.json()["contact"] == NONE
    assert other.slug != studio.slug


@pytest.mark.parametrize("raw", ["+1 ٤٧٣ ٤٤٠ ١٢٣٤", "+१४७३४४०१२३४"])
def test_phone_and_whatsapp_accept_ascii_digits_only(raw: str) -> None:
    with pytest.raises(ValueError, match="country code"):
        contact.normalise_phone(raw)
    with pytest.raises(ValueError, match="WhatsApp"):
        contact.normalise_whatsapp(raw)


async def test_a_save_without_contact_fields_keeps_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)
    # A client (or a seed) that does not know the contact options.
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Renamed Studio",
            "enabled": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["display_name"] == "Renamed Studio"
    assert {key: body[f"contact_{key}"] for key in STORED} == STORED


async def test_the_seed_keeps_contacts_set_in_studio(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, **ALL_FOUR)
    await service.upsert_profile(
        db_async,
        organisation_id=studio.org_id,
        payload=BookingProfileUpdate(
            public_slug=studio.slug, display_name="Seeded again", enabled=True
        ),
    )
    await db_async.commit()
    stored = await async_client.get(f"{API}/public/{studio.slug}")
    assert stored.json()["contact"] == STORED
