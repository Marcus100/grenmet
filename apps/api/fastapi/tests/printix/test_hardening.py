"""Hardening from the security review of PR #1463.

Covers: control characters, typed numbers (off by default), the advisory-locked
scan caps (with a concurrent proof), the Redis limits on the summary and the
per-address cap, authentication classes on each route family, void and unvoid on a
closed event, and the acting administrator recorded in the audit log.
"""

import asyncio
import random
from collections.abc import Awaitable, Callable

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service as auth_service
from src.auth import totp
from src.auth.config import auth_settings
from src.auth.models import User
from src.printix import constants
from src.rate_limit import limiter, visitor_address
from src.utils.datetime import utc_now
from tests.factories import assign_role, make_role_with_permission, make_user

from .support import (
    ADMIN,
    SCANNER,
    bearer,
    make_event,
    make_pairing,
    make_ticket,
    outcome_of,
    scan,
)

pytestmark = pytest.mark.usefixtures("db_async")

MakeAdmin = Callable[[], Awaitable[tuple[User, dict[str, str]]]]


@pytest.fixture
def limits_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """The conftest turns slowapi off; these tests switch it on for their duration."""
    monkeypatch.setattr(limiter, "enabled", True)


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


@pytest.fixture
async def admin(mfa_admin: MakeAdmin) -> tuple[User, dict[str, str]]:
    return await mfa_admin()


# --- Control characters -----------------------------------------------------


@pytest.mark.parametrize("value", ["PX\x00", "A\tB", "A\nB", "A\x1bB", "\x7f"])
async def test_a_scan_with_a_control_character_is_a_clean_422(
    async_client: httpx.AsyncClient, db_async: AsyncSession, value: str
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    response = await scan(async_client, secret, value)

    assert response.status_code == 422


# --- Typed numbers ----------------------------------------------------------


async def test_a_typed_number_is_unknown_unless_the_pairing_allows_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "042", barcode="PX-042-BAR")
    _, barcode_only = await make_pairing(db_async, event, gate="Barcode only")
    _, typed = await make_pairing(
        db_async, event, gate="Typed", allow_typed_numbers=True
    )

    refused = await scan(async_client, barcode_only, "042")
    admitted = await scan(async_client, typed, "042")

    assert outcome_of(refused) == "unknown"
    assert outcome_of(admitted) == "admitted"


async def test_the_barcode_still_admits_when_typed_numbers_are_off(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "042", barcode="PX-042-BAR")
    _, secret = await make_pairing(db_async, event)

    assert outcome_of(await scan(async_client, secret, "PX-042-BAR")) == "admitted"


async def test_typed_number_attempts_have_a_low_cap(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(constants, "TYPED_NUMBER_SCANS_PER_WINDOW", 2)
    event = await make_event(db_async)
    for number in ("001", "002", "003", "004"):
        await make_ticket(db_async, event, number, barcode=f"PX-{number}")
    _, secret = await make_pairing(db_async, event, allow_typed_numbers=True)

    first = await scan(async_client, secret, "001")
    second = await scan(async_client, secret, "002")
    third = await scan(async_client, secret, "003")
    barcode = await scan(async_client, secret, "PX-004")

    assert outcome_of(first) == "admitted"
    assert outcome_of(second) == "admitted"
    assert third.status_code == 429
    assert third.headers["Retry-After"] == str(constants.SCAN_WINDOW_SECONDS)
    assert outcome_of(barcode) == "admitted"


async def test_unknown_outcomes_have_a_low_cap_but_valid_scans_still_pass(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(constants, "UNKNOWN_SCANS_PER_WINDOW", 2)
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PX-001")
    _, secret = await make_pairing(db_async, event)

    assert outcome_of(await scan(async_client, secret, "NOPE-1")) == "unknown"
    assert outcome_of(await scan(async_client, secret, "NOPE-2")) == "unknown"
    blocked = await scan(async_client, secret, "NOPE-3")
    valid = await scan(async_client, secret, "PX-001")

    assert blocked.status_code == 429
    assert outcome_of(valid) == "admitted"


async def test_the_per_pairing_cap_holds_under_concurrent_scans(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ten scans in flight at once: exactly the cap gets through, the rest are 429."""
    monkeypatch.setattr(constants, "SCANS_PER_WINDOW", 3)
    event = await make_event(db_async)
    for index in range(10):
        await make_ticket(db_async, event, f"{index:03d}", barcode=f"PXC-{index}")
    _, secret = await make_pairing(db_async, event)

    responses = await asyncio.gather(
        *(scan(async_client, secret, f"PXC-{index}") for index in range(10))
    )

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [200, 200, 200] + [429] * 7


# --- Redis-backed limits ----------------------------------------------------


@pytest.mark.usefixtures("limits_on")
async def test_the_summary_is_limited_to_thirty_a_minute_per_pairing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    responses = [
        await async_client.get(f"{SCANNER}/summary", headers=bearer(secret))
        for _ in range(constants.SUMMARY_READS_PER_MINUTE + 1)
    ]

    assert [r.status_code for r in responses[:-1]] == [200] * 30
    assert responses[-1].status_code == 429
    assert "error" in responses[-1].json()


@pytest.mark.usefixtures("limits_on")
async def test_the_address_limit_refuses_the_fourth_request_from_one_address() -> None:
    """The same limiter the gate routes use, on a probe route with a cap of three.

    slowapi reads a limit string when the decorator runs, so the gate routes cannot
    be given a smaller cap in a test; this proves the mechanism instead.
    """
    probe = FastAPI()

    @probe.get("/probe")
    @limiter.limit("3/minute", key_func=visitor_address)
    async def probe_route(request: Request) -> dict[str, str]:
        del request  # slowapi reads it from the signature to key the limit
        return {"ok": "yes"}

    address = f"10.{random.randint(0, 255)}.{random.randint(0, 255)}.9"
    transport = httpx.ASGITransport(app=probe, client=(address, 5000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        statuses = [(await client.get("/probe")).status_code for _ in range(4)]

    assert statuses == [200, 200, 200, 429]


def test_the_gate_routes_carry_their_limits() -> None:
    """Admissions: the address cap. Summary: the address cap and the per-pairing cap."""
    admit = "src.printix.scanner_router.admit_ticket_endpoint"
    summary = "src.printix.scanner_router.pairing_summary_endpoint"

    assert len(limiter._route_limits[admit]) == 1
    assert len(limiter._route_limits[summary]) == 2


# --- Authentication classes -------------------------------------------------


async def test_a_user_token_on_a_scanner_route_is_401(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    token = normal_user_token_headers_async["Authorization"].removeprefix("Bearer ")

    response = await scan(async_client, token, "001")

    assert response.status_code == 401


async def test_a_pairing_secret_on_an_admin_route_is_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/summary", headers=bearer(secret)
    )

    assert response.status_code == 401


async def test_a_superuser_without_an_mfa_session_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin_user = await make_user(db_async, superuser=True)
    admin_user.totp_secret = totp.encrypt_secret(totp.generate_secret())
    admin_user.totp_enabled = True
    await db_async.commit()
    stored, _ = await auth_service.create_session(
        session=db_async,
        user=admin_user,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=None,
    )
    token, _ = auth_service.issue_access_token_for_user(
        user=admin_user, db_session=stored
    )
    event = await make_event(db_async)

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


async def test_a_non_superuser_holding_printix_manage_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "printix.manage")
    await assign_role(db_async, user=user, role=role)
    stored, _ = await auth_service.create_session(
        session=db_async,
        user=user,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=utc_now(),
    )
    token, _ = auth_service.issue_access_token_for_user(user=user, db_session=stored)
    event = await make_event(db_async)

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


# --- Closed events ----------------------------------------------------------


async def test_void_and_unvoid_are_refused_after_close(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
    db_async: AsyncSession,
) -> None:
    _, headers = admin
    event = await make_event(db_async)
    live = await make_ticket(db_async, event, "001")
    gone = await make_ticket(db_async, event, "002", status="void")
    event.status = "closed"
    await db_async.commit()

    voided = await async_client.post(f"{ADMIN}/tickets/{live.id}/void", headers=headers)
    unvoided = await async_client.post(
        f"{ADMIN}/tickets/{gone.id}/unvoid", headers=headers
    )

    assert voided.status_code == 409
    assert unvoided.status_code == 409


async def test_revoking_a_pairing_is_still_allowed_after_close(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
    db_async: AsyncSession,
) -> None:
    _, headers = admin
    event = await make_event(db_async)
    pairing, _ = await make_pairing(db_async, event)
    event.status = "closed"
    await db_async.commit()

    response = await async_client.post(
        f"{ADMIN}/pairings/{pairing.id}/revoke", headers=headers
    )

    assert response.status_code == 200
    assert response.json()["revoked_at"] is not None


# --- Acting administrator in the audit log ----------------------------------


async def test_admin_actions_are_attributed_to_the_administrator(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
    db_async: AsyncSession,
) -> None:
    admin_user, headers = admin
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PX-SECRET-BARCODE")
    pairing, _ = await make_pairing(db_async, event)

    imported = await async_client.post(
        f"{ADMIN}/events/{event.id}/tickets/import",
        headers=headers,
        params={"dry_run": "false"},
        files={
            "file": ("tickets.csv", b"number,barcode\n002,PX-NEW-BARCODE\n", "text/csv")
        },
    )
    voided = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/void", headers=headers
    )
    unvoided = await async_client.post(
        f"{ADMIN}/tickets/{ticket.id}/unvoid", headers=headers
    )
    revoked = await async_client.post(
        f"{ADMIN}/pairings/{pairing.id}/revoke", headers=headers
    )
    closed = await async_client.post(
        f"{ADMIN}/events/{event.id}/close", headers=headers
    )

    assert imported.status_code == 200, imported.text
    assert voided.status_code == 200
    assert unvoided.status_code == 200
    assert revoked.status_code == 200
    assert closed.status_code == 200

    rows = (
        (
            await db_async.execute(
                select(AuditEntry).where(
                    AuditEntry.entity_type == "printix_event",
                    AuditEntry.entity_id == str(event.id),
                )
            )
        )
        .scalars()
        .all()
    )
    attributed = {
        (r.record_type, r.action) for r in rows if r.actor_user_id == admin_user.id
    }
    assert ("printix_ticket_import", "create") in attributed
    assert ("printix_ticket", "update") in attributed
    assert ("printix_pairing", "update") in attributed
    assert ("printix_event", "update") in attributed
    recorded = repr([r.changes for r in rows])
    assert "PX-SECRET-BARCODE" not in recorded
    assert "PX-NEW-BARCODE" not in recorded
    assert pairing.token_hash not in recorded


# --- Summaries are scoped to their event --------------------------------------


async def test_summaries_count_only_their_own_event(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
    db_async: AsyncSession,
) -> None:
    _, headers = admin
    first = await make_event(db_async, name="First")
    second = await make_event(db_async, name="Second")
    await make_ticket(db_async, first, "001")
    await make_ticket(db_async, first, "002")
    await make_ticket(db_async, second, "001")
    _, first_secret = await make_pairing(db_async, first, gate="First gate")
    _, second_secret = await make_pairing(db_async, second, gate="Second gate")
    await scan(async_client, first_secret, "001")
    await scan(async_client, second_secret, "001")
    await scan(async_client, second_secret, "001")  # duplicate on the second event

    first_admin = await async_client.get(
        f"{ADMIN}/events/{first.id}/summary", headers=headers
    )
    second_admin = await async_client.get(
        f"{ADMIN}/events/{second.id}/summary", headers=headers
    )
    first_public = await async_client.get(
        f"{SCANNER}/summary", headers=bearer(first_secret)
    )

    assert first_admin.json()["duplicates_refused"] == 0
    assert second_admin.json()["duplicates_refused"] == 1
    assert first_admin.json()["admitted_by_gate"] == [
        {"gate": "First gate", "admitted": 1}
    ]
    assert first_public.status_code == 200
    assert first_public.json()["event"]["name"] == "First"
    assert first_public.json()["issued"] == 2
    assert first_public.json()["admitted"] == 1
    assert first_public.json()["duplicates_refused"] == 0


# --- Ticket order and event dates -------------------------------------------


async def test_tickets_list_digit_numbers_in_numeric_order(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
    db_async: AsyncSession,
) -> None:
    _, headers = admin
    event = await make_event(db_async)
    for number in ("10", "9", "100", "2A"):
        await make_ticket(db_async, event, number)

    response = await async_client.get(
        f"{ADMIN}/events/{event.id}/tickets", headers=headers
    )

    assert [item["printed_number"] for item in response.json()["items"]] == [
        "9",
        "10",
        "100",
        "2A",
    ]


async def test_an_event_cannot_close_before_its_event_date(
    async_client: httpx.AsyncClient,
    admin: tuple[User, dict[str, str]],
) -> None:
    _, headers = admin

    response = await async_client.post(
        f"{ADMIN}/events",
        headers=headers,
        json={
            "name": "Early close",
            "event_date": "2026-12-26",
            "closes_at": "2026-12-25T12:00:00Z",
        },
    )

    assert response.status_code == 422
