"""Organiser brand colour and logo in event mail (issue #1622).

The owner or an admin sets ``brand_color`` with the profile edit. The buyer's and the
reminder mails then carry the accent and the organiser's logo (the same ``logo_file_id``
the organiser already has). A pale colour falls back to the Barrels navy.
"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.config import settings
from src.events import emails
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_organiser_profile import _organiser, _setup

PROFILE = f"{BASE}/manage/organiser"
API_BASE = "https://api.example.test"
BLUE = "#2563eb"
PALE = "#ffff00"
START = datetime(2026, 12, 20, 22, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_owner_sets_lower_cases_and_clears_the_brand_colour(
    events_db: SessionFactory, db_async: AsyncSession
) -> None:
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        saved = await client.patch(PROFILE, json={"brand_color": "#2563EB"})
        assert saved.status_code == 200, saved.text
        assert saved.json()["brand_color"] == BLUE
        assert (await _organiser(events_db)).brand_color == BLUE

        # Leaving it out keeps it; null clears it.
        kept = await client.patch(PROFILE, json={"bio": "Still blue."})
        assert kept.json()["brand_color"] == BLUE
        cleared = await client.patch(PROFILE, json={"brand_color": None})
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["brand_color"] is None
    assert (await _organiser(events_db)).brand_color is None


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["red", "#fff", "#0b63ee00", "2563eb"])
async def test_an_invalid_brand_colour_is_422(
    events_db: SessionFactory, db_async: AsyncSession, bad: str
) -> None:
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        response = await client.patch(PROFILE, json={"brand_color": bad})
    assert response.status_code == 422, response.text
    assert "brand_color" in response.text


def test_the_brand_carries_the_accent_and_the_logo_when_there_is_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    file_id = uuid.uuid4()
    brand = emails.brand("Crew", BLUE, file_id)
    assert brand.accent == BLUE
    assert brand.logo == layout.Logo(
        f"{API_BASE}/api/v1/storage/public/{file_id}", alt="Crew"
    )


def test_no_logo_without_a_public_address_or_a_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", None)
    assert emails.brand("Crew", BLUE, uuid.uuid4()).logo is None
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    assert emails.brand("Crew", BLUE, None).logo is None


def _receipt(brand: emails.Brand) -> layout.EmailCard:
    return emails.order_confirmation(
        buyer_name="Ann Example",
        title="Harbour Walk",
        starts_at=START,
        ticket_count=2,
        total_minor=5000,
        currency="XCD",
        tickets_url="https://events.example.test/me/tickets",
        organiser=brand.name,
        brand=brand,
    )


def _refund(brand: emails.Brand) -> layout.EmailCard:
    # A refund's chip is grey (an ended status), so the accent is not printed.
    return emails.order_refunded(
        buyer_name="Ann Example",
        title="Harbour Walk",
        order_ref="ABCD1234",
        refund_minor=5000,
        currency="XCD",
        full=True,
        card=True,
        event_cancelled=False,
        brand=brand,
    )


def _reminder(brand: emails.Brand) -> layout.EmailCard:
    return emails.event_reminder(
        name="Ann Example",
        title="Harbour Walk",
        starts_at=START,
        venue="Pier",
        tickets_url="https://events.example.test/me/tickets",
        brand=brand,
    )


@pytest.mark.parametrize(
    ("build", "accent_printed"),
    [(_receipt, True), (_refund, False), (_reminder, True)],
    ids=["receipt", "refund", "reminder"],
)
def test_every_buyer_mail_uses_the_brand(
    build: Callable[[emails.Brand], layout.EmailCard],
    accent_printed: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    file_id = uuid.uuid4()

    card = build(emails.brand("Crew", BLUE, file_id))
    html = layout.render_html(card)
    assert card.accent == BLUE
    assert f'src="{API_BASE}/api/v1/storage/public/{file_id}" alt="Crew"' in html
    assert (BLUE in html) is accent_printed
    # Images blocked: the organiser's name is still in the text of the mail.
    assert "Crew" in layout.render_text(card)

    pale = build(emails.brand("Crew", PALE, None))
    assert pale.accent == layout.NAVY  # the pale colour never reaches the mail
    assert PALE not in layout.render_html(pale)
    assert "<img" not in layout.render_html(pale)


def test_a_buyer_mail_without_a_brand_is_the_barrels_look() -> None:
    card = emails.event_reminder(
        name="Ann Example",
        title="Harbour Walk",
        starts_at=START,
        venue="Pier",
        tickets_url="https://events.example.test/me/tickets",
    )
    assert card.accent == layout.NAVY
    assert card.logo is None
