"""Administrator routes: superuser with an enrolled authenticator, MFA session."""

import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.printix.models import PrintixPairing
from src.utils.datetime import utc_now

from .support import (
    ADMIN,
    in_hours,
    make_event,
    make_pairing,
    make_ticket,
    outcome_of,
    scan,
)

pytestmark = pytest.mark.usefixtures("db_async")

MakeAdmin = Callable[[], Awaitable[tuple[User, dict[str, str]]]]


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


@pytest.fixture
async def admin_headers(mfa_admin: MakeAdmin) -> dict[str, str]:
    _, headers = await mfa_admin()
    return headers


def event_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "Boxing Day Gala",
        "event_date": "2026-12-26",
        "closes_at": (utc_now() + timedelta(days=2)).isoformat() + "Z",
    }
    body.update(overrides)
    return body


# --- Superuser and MFA gate -------------------------------------------------


async def test_a_normal_user_cannot_use_any_admin_route(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    responses = [
        await async_client.post(
            f"{ADMIN}/events",
            headers=normal_user_token_headers_async,
            json=event_body(),
        ),
        await async_client.get(
            f"{ADMIN}/events/{event.id}/summary",
            headers=normal_user_token_headers_async,
        ),
        await async_client.post(
            f"{ADMIN}/events/{event.id}/pairings",
            headers=normal_user_token_headers_async,
            json={"gate": "Gate 1"},
        ),
    ]

    assert [r.status_code for r in responses] == [403, 403, 403]


async def test_a_superuser_without_an_authenticator_is_refused(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.post(
        f"{ADMIN}/events", headers=superuser_token_headers_async, json=event_body()
    )

    assert response.status_code == 403
    assert "superuser_mfa_required" in response.json()["detail"]


async def test_a_superuser_with_mfa_creates_an_event(
    async_client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    response = await async_client.post(
        f"{ADMIN}/events", headers=admin_headers, json=event_body()
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Boxing Day Gala"
    assert body["status"] == "open"
    assert body["event_date"] == "2026-12-26"
    assert body["closes_at"].endswith("Z")


async def test_an_event_cannot_close_in_the_past(
    async_client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    past = (utc_now() - timedelta(hours=1)).isoformat() + "Z"

    response = await async_client.post(
        f"{ADMIN}/events", headers=admin_headers, json=event_body(closes_at=past)
    )

    assert response.status_code == 422


async def test_close_event_is_idempotent(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    first = await async_client.post(
        f"{ADMIN}/events/{event.id}/close", headers=admin_headers
    )
    second = await async_client.post(
        f"{ADMIN}/events/{event.id}/close", headers=admin_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "closed"
    assert second.json()["status"] == "closed"


async def test_unknown_event_is_404(
    async_client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    response = await async_client.get(
        f"{ADMIN}/events/{uuid.uuid4()}/summary", headers=admin_headers
    )

    assert response.status_code == 404


# --- Tickets ----------------------------------------------------------------


async def test_ticket_list_filters_pages_and_counts(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    for number in ("001", "002", "003"):
        await make_ticket(db_async, event, number)
    voided = await make_ticket(db_async, event, "004", status="void")
    assert voided.status == "void"

    everything = await async_client.get(
        f"{ADMIN}/events/{event.id}/tickets", headers=admin_headers
    )
    page = await async_client.get(
        f"{ADMIN}/events/{event.id}/tickets",
        headers=admin_headers,
        params={"size": 2, "page": 2},
    )
    voids = await async_client.get(
        f"{ADMIN}/events/{event.id}/tickets",
        headers=admin_headers,
        params={"status": "void"},
    )

    assert everything.json()["total"] == 4
    assert [t["printed_number"] for t in everything.json()["items"]] == [
        "001",
        "002",
        "003",
        "004",
    ]
    assert [t["printed_number"] for t in page.json()["items"]] == ["003", "004"]
    assert [t["printed_number"] for t in voids.json()["items"]] == ["004"]


async def test_ticket_list_never_shows_the_barcode(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="SECRET-BARCODE-VALUE")

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/tickets", headers=admin_headers
    )

    assert "SECRET-BARCODE-VALUE" not in response.text
    assert "barcode" not in response.json()["items"][0]


async def test_void_and_unvoid_a_ticket(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001")

    voided = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/void", headers=admin_headers
    )
    again = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/void", headers=admin_headers
    )
    unvoided = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/unvoid", headers=admin_headers
    )

    assert voided.json()["status"] == "void"
    assert again.status_code == 200
    assert unvoided.json()["status"] == "valid"


async def test_an_admitted_ticket_cannot_be_voided(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)

    assert outcome_of(await scan(async_client, secret, "001")) == "admitted"

    response = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/void", headers=admin_headers
    )

    assert response.status_code == 409


# --- Pairings ---------------------------------------------------------------


async def test_pairing_returns_its_secret_once_and_expires_six_hours_after_close(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    created = await async_client.post(
        f"{ADMIN}/events/{event.id}/pairings",
        headers=admin_headers,
        json={"gate": "Gate 2"},
    )
    listed = await async_client.get(
        f"{ADMIN}/events/{event.id}/pairings", headers=admin_headers
    )

    body = created.json()
    assert created.status_code == 201
    assert len(body["secret"]) >= 43
    assert body["gate"] == "Gate 2"
    expected = event.closes_at + timedelta(hours=6)
    assert body["expires_at"].startswith(expected.isoformat()[:16])
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "secret" not in listed.json()[0]
    assert body["secret"] not in listed.text


async def test_pairing_expiry_must_be_in_the_future_and_within_a_day_of_close(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    past = (utc_now() - timedelta(minutes=5)).isoformat() + "Z"
    too_late = (event.closes_at + timedelta(days=2)).isoformat() + "Z"

    expired = await async_client.post(
        f"{ADMIN}/events/{event.id}/pairings",
        headers=admin_headers,
        json={"gate": "Gate 1", "expires_at": past},
    )
    late = await async_client.post(
        f"{ADMIN}/events/{event.id}/pairings",
        headers=admin_headers,
        json={"gate": "Gate 1", "expires_at": too_late},
    )

    assert expired.status_code == 422
    assert late.status_code == 422


async def test_no_pairing_for_a_closed_event(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async, status="closed")

    response = await async_client.post(
        f"{ADMIN}/events/{event.id}/pairings",
        headers=admin_headers,
        json={"gate": "Gate 1"},
    )

    assert response.status_code == 409


async def test_revoke_pairing_is_idempotent_and_stops_the_phone(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    pairing, _ = await make_pairing(db_async, event)

    first = await async_client.post(
        f"{ADMIN}/pairings/{pairing.id}/revoke", headers=admin_headers
    )
    second = await async_client.post(
        f"{ADMIN}/pairings/{pairing.id}/revoke", headers=admin_headers
    )

    assert first.status_code == 200
    assert first.json()["revoked_at"] is not None
    assert second.status_code == 200
    stored = await db_async.get(PrintixPairing, pairing.id, populate_existing=True)
    assert stored is not None
    assert stored.revoked_at is not None


# --- Summary ----------------------------------------------------------------


async def test_summary_counts_in_not_yet_in_gates_and_duplicates(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async, name="Summary night")
    for number in ("001", "002", "003"):
        await make_ticket(db_async, event, number)
    await make_ticket(db_async, event, "009", status="void")
    _, secret_one = await make_pairing(db_async, event, gate="North")
    _, secret_two = await make_pairing(db_async, event, gate="South")

    await scan(async_client, secret_one, "001")
    await scan(async_client, secret_two, "001")  # duplicate, refused
    await scan(async_client, secret_two, "002")

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/summary", headers=admin_headers
    )

    body = response.json()
    assert body["event"]["name"] == "Summary night"
    assert body["issued"] == 4
    assert body["void"] == 1
    assert body["admitted"] == 2
    assert body["not_yet_in"] == 1
    assert body["duplicates_refused"] == 1
    assert sorted((g["gate"], g["admitted"]) for g in body["admitted_by_gate"]) == [
        ("North", 1),
        ("South", 1),
    ]


async def test_pairing_for_an_expiry_in_the_future_is_accepted(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    soon = in_hours(2).isoformat() + "Z"

    response = await async_client.post(
        f"{ADMIN}/events/{event.id}/pairings",
        headers=admin_headers,
        json={"gate": "Gate 1", "expires_at": soon},
    )

    assert response.status_code == 201
    assert response.json()["expires_at"].startswith(in_hours(2).isoformat()[:13])
