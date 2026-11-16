"""Printix organiser write routes and gate QR codes (ADR-0060 organiser amendment,
slices 4 and 5).

Events (create, close, import, tickets, void, restore) need ``printix.events.manage``;
gate QR codes (pairings) need ``printix.gates.manage``. The organiser holds both; the gate
lead holds only the gate key. Another organisation's record is 404. Every write records
the organiser as the audit actor.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.config import settings
from src.organisations.models import PlatformOrganisation
from src.printix.models import PrintixPairing, PrintixTicket
from src.rate_limit import limiter

from .org_support import (
    ORG,
    _event,  # noqa: F401  (fixture dependency of world)
    _grant,  # noqa: F401
    _org,  # noqa: F401
    _org_header,
    _organiser,
    _sign_in,
    make_org_member,  # noqa: F401
)
from .support import make_ticket, scan

ADMIN = f"{settings.API_V1_STR}/printix/admin"
PAIRING_FIELDS = {
    "id",
    "gate",
    "created_at",
    "expires_at",
    "revoked_at",
    "allow_typed_numbers",
}


async def _headers(db: AsyncSession, user, org: PlatformOrganisation) -> dict[str, str]:
    return {**await _sign_in(db, user), **_org_header(org)}


def _csv(*rows: str) -> dict[str, Any]:
    body = "number,barcode\n" + "\n".join(rows) + "\n"
    return {"file": ("tickets.csv", body.encode(), "text/csv")}


async def _pair_setup(db: AsyncSession, world: dict[str, Any]) -> tuple[Any, Any]:
    """An organiser and a gate lead of organisation A."""
    organiser = await _organiser(db, world["org_a"], "printix-organiser")
    gate_lead = await _organiser(db, world["org_a"], "printix-gate-lead")
    return organiser, gate_lead


# --- Events --------------------------------------------------------------------


async def test_the_organiser_creates_an_event_owned_by_their_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    response = await async_client.post(
        f"{ORG}/events",
        headers=headers,
        json={
            "name": "Boxing Day",
            "event_date": "2026-12-26",
            "closes_at": "2026-12-27T18:00:00Z",
            "organisation_id": world["org_b"].id,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["organisation_id"] == world["org_a"].id
    audit = await db_async.scalar(
        select(AuditEntry).where(AuditEntry.entity_id == body["id"])
    )
    assert audit is not None
    assert audit.actor_user_id == organiser.id
    assert audit.actor_app == "printix"


async def test_the_gate_lead_cannot_create_or_close_events(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    _, gate_lead = await _pair_setup(db_async, world)
    headers = await _headers(db_async, gate_lead, world["org_a"])
    created = await async_client.post(
        f"{ORG}/events",
        headers=headers,
        json={
            "name": "No",
            "event_date": "2026-12-26",
            "closes_at": "2026-12-27T18:00:00Z",
        },
    )
    closed = await async_client.post(
        f"{ORG}/events/{world['ev_a'].id}/close", headers=headers
    )
    assert created.status_code == 403
    assert closed.status_code == 403


async def test_the_organiser_closes_their_event_and_not_another_organisations(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    foreign = await async_client.post(
        f"{ORG}/events/{world['ev_b'].id}/close", headers=headers
    )
    assert foreign.status_code == 404
    closed = await async_client.post(
        f"{ORG}/events/{world['ev_a'].id}/close", headers=headers
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"


# --- Import: dry run, weak barcodes, all-or-nothing --------------------------------


async def test_a_dry_run_writes_nothing_and_reports_line_errors(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    event_id = world["ev_a"].id
    response = await async_client.post(
        f"{ORG}/events/{event_id}/tickets/import",
        headers=headers,
        files=_csv("001,BARCODE-LONG-001", ",BARCODE-NO-NUMBER"),
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["dry_run"] is True
    assert report["applied"] is False
    assert report["errors"], report
    assert all(issue["line"] >= 2 for issue in report["errors"])
    count = await db_async.scalar(
        select(PrintixTicket.id).where(PrintixTicket.event_id == event_id)
    )
    assert count is None


async def test_the_real_import_writes_all_rows_or_none(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    event_id = world["ev_a"].id
    bad = await async_client.post(
        f"{ORG}/events/{event_id}/tickets/import",
        headers=headers,
        params={"dry_run": "false"},
        files=_csv("001,BARCODE-LONG-001", ",BARCODE-NO-NUMBER"),
    )
    assert bad.json()["applied"] is False
    good = await async_client.post(
        f"{ORG}/events/{event_id}/tickets/import",
        headers=headers,
        params={"dry_run": "false"},
        files=_csv("001,BARCODE-LONG-001", "002,BARCODE-LONG-002"),
    )
    assert good.status_code == 200, good.text
    assert good.json()["applied"] is True
    listed = await async_client.get(f"{ORG}/events/{event_id}/tickets", headers=headers)
    assert listed.json()["total"] == 2
    assert "BARCODE" not in listed.text


async def test_the_report_counts_short_and_number_barcodes(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    response = await async_client.post(
        f"{ORG}/events/{world['ev_a'].id}/tickets/import",
        headers=headers,
        files=_csv(
            "001,LONGENOUGH-0001",
            "002,SHORT",
            "003,003",
            "004,",
        ),
    )
    report = response.json()
    assert report["dry_run"] is True
    assert report["applied"] is False
    # SHORT (5 characters), 003 and the defaulted 004 are short; 003 and 004 equal their number.
    assert report["short_barcodes"] == 3
    assert report["barcode_equals_number"] == 2


async def test_a_cross_organisation_import_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    response = await async_client.post(
        f"{ORG}/events/{world['ev_b'].id}/tickets/import",
        headers=headers,
        params={"dry_run": "false"},
        files=_csv("001,LONGENOUGH-0001"),
    )
    assert response.status_code == 404


# --- Tickets: list, void, restore ---------------------------------------------------


async def test_tickets_are_listed_voided_and_restored_for_the_organiser(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, gate_lead = await _pair_setup(db_async, world)
    ticket = await make_ticket(
        db_async, world["ev_a"], "001", barcode="LONGENOUGH-0001"
    )
    foreign = await make_ticket(
        db_async, world["ev_b"], "001", barcode="LONGENOUGH-B001"
    )
    headers = await _headers(db_async, organiser, world["org_a"])
    listed = await async_client.get(
        f"{ORG}/events/{world['ev_a'].id}/tickets", headers=headers
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [str(ticket.id)]
    assert "LONGENOUGH" not in listed.text
    voided = await async_client.post(f"{ORG}/tickets/{ticket.id}/void", headers=headers)
    assert voided.json()["status"] == "void"
    restored = await async_client.post(
        f"{ORG}/tickets/{ticket.id}/unvoid", headers=headers
    )
    assert restored.json()["status"] == "valid"
    other = await async_client.post(f"{ORG}/tickets/{foreign.id}/void", headers=headers)
    assert other.status_code == 404
    other_list = await async_client.get(
        f"{ORG}/events/{world['ev_b'].id}/tickets", headers=headers
    )
    assert other_list.status_code == 404

    lead = await _headers(db_async, gate_lead, world["org_a"])
    refused = await async_client.get(
        f"{ORG}/events/{world['ev_a'].id}/tickets", headers=lead
    )
    assert refused.status_code == 403
    assert (
        await async_client.post(f"{ORG}/tickets/{ticket.id}/void", headers=lead)
    ).status_code == 403


# --- Gate QR codes (pairings) ------------------------------------------------------


async def test_the_gate_lead_makes_lists_and_cancels_a_gate_code(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    _, gate_lead = await _pair_setup(db_async, world)
    headers = await _headers(db_async, gate_lead, world["org_a"])
    event_id = world["ev_a"].id
    made = await async_client.post(
        f"{ORG}/events/{event_id}/pairings",
        headers=headers,
        json={"gate": "Gate 1"},
    )
    assert made.status_code == 201, made.text
    body = made.json()
    secret = body["secret"]
    assert secret
    assert body["allow_typed_numbers"] is False
    assert set(body) >= PAIRING_FIELDS

    listed = await async_client.get(
        f"{ORG}/events/{event_id}/pairings", headers=headers
    )
    assert listed.status_code == 200
    assert secret not in listed.text
    assert "secret" not in listed.json()[0]

    ticket = await make_ticket(
        db_async, world["ev_a"], "001", barcode="LONGENOUGH-0001"
    )
    admitted = await scan(async_client, secret, ticket.barcode_value)
    assert admitted.status_code == 200

    revoked = await async_client.post(
        f"{ORG}/pairings/{body['id']}/revoke", headers=headers
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None
    refused = await scan(async_client, secret, ticket.barcode_value)
    assert refused.status_code == 403


async def test_the_default_expiry_is_six_hours_after_close_and_typed_numbers_are_off(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    _, gate_lead = await _pair_setup(db_async, world)
    headers = await _headers(db_async, gate_lead, world["org_a"])
    event = world["ev_a"]
    await db_async.refresh(event)
    made = await async_client.post(
        f"{ORG}/events/{event.id}/pairings", headers=headers, json={"gate": "Gate 2"}
    )
    expires = datetime.fromisoformat(made.json()["expires_at"].replace("Z", "+00:00"))
    closes = event.closes_at.replace(tzinfo=UTC, microsecond=0)
    assert expires == closes + timedelta(hours=6)
    typed = await async_client.post(
        f"{ORG}/events/{event.id}/pairings",
        headers=headers,
        json={"gate": "Gate 3", "allow_typed_numbers": True},
    )
    assert typed.json()["allow_typed_numbers"] is True


async def test_a_cross_organisation_pairing_is_404_on_every_route(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    _, gate_lead = await _pair_setup(db_async, world)
    headers = await _headers(db_async, gate_lead, world["org_a"])
    foreign_event = world["ev_b"].id
    made = await async_client.post(
        f"{ORG}/events/{foreign_event}/pairings", headers=headers, json={"gate": "G"}
    )
    listed = await async_client.get(
        f"{ORG}/events/{foreign_event}/pairings", headers=headers
    )
    assert made.status_code == 404
    assert listed.status_code == 404
    pairing = PrintixPairing(
        id=uuid.uuid4(),
        event_id=world["ev_b"].id,
        gate="G",
        token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        expires_at=datetime(2030, 1, 1),
        created_at=datetime(2026, 1, 1),
    )
    db_async.add(pairing)
    await db_async.commit()
    revoked = await async_client.post(
        f"{ORG}/pairings/{pairing.id}/revoke", headers=headers
    )
    assert revoked.status_code == 404


async def test_an_organiser_event_with_no_organisation_is_404_for_pairings(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    response = await async_client.post(
        f"{ORG}/events/{world['ev_none'].id}/pairings",
        headers=headers,
        json={"gate": "G"},
    )
    assert response.status_code == 404


# --- Per-user limit and admin behaviour --------------------------------------------


async def test_the_per_user_write_limit_refuses_the_thirty_first_write(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    organiser, _ = await _pair_setup(db_async, world)
    headers = await _headers(db_async, organiser, world["org_a"])
    ticket = await make_ticket(
        db_async, world["ev_a"], "001", barcode="LONGENOUGH-0001"
    )
    statuses = []
    for _ in range(31):
        response = await async_client.post(
            f"{ORG}/tickets/{ticket.id}/unvoid", headers=headers
        )
        statuses.append(response.status_code)
    assert statuses[:30] == [200] * 30
    assert statuses[30] == 429


async def test_admin_routes_are_unchanged_by_the_organiser_writes(
    async_client: httpx.AsyncClient, mfa_admin
) -> None:
    _, headers = await mfa_admin()
    created = await async_client.post(
        f"{ADMIN}/events",
        headers=headers,
        json={
            "name": "Admin",
            "event_date": "2026-12-26",
            "closes_at": "2026-12-27T18:00:00Z",
        },
    )
    assert created.status_code == 201
    assert created.json()["organisation_id"] is None
    closed = await async_client.post(
        f"{ADMIN}/events/{created.json()['id']}/close", headers=headers
    )
    assert closed.status_code == 200
