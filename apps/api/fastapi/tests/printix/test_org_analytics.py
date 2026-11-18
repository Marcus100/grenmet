"""Printix organiser dashboard: analytics, recent scans and the CSV export.

Same access rules as the other organiser reads (either Printix key, an authenticator
session, the organisation's own events only). The numbers come from a seeded scan log
that includes admissions made offline and synced late. No barcode appears anywhere.
"""

import csv
import io
import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import analytics as analytics_module
from src.printix.analytics import csv_cell
from src.printix.models import PrintixEvent, PrintixPairing, PrintixScanLog
from src.rate_limit import limiter
from src.utils.datetime import utc_now

from .org_support import (
    ORG,
    _app_user,
    _org_header,
    _organiser,
    _sign_in,
)
from .support import make_event, make_pairing, make_ticket

pytestmark = pytest.mark.usefixtures("db_async")

SECRET_PREFIX = "SECRETBARCODE-"
ROUTES = ("analytics", "scans", "scans/export")


def _base() -> datetime:
    """A quarter-hour boundary an hour ago, so the five-minute buckets are stable."""
    now = utc_now().replace(second=0, microsecond=0)
    return now - timedelta(hours=1, minutes=now.minute % 15)


async def _headers(
    db: AsyncSession, org: Any, role: str = "printix-organiser"
) -> dict[str, str]:
    user = await _organiser(db, org, role)
    return {**await _sign_in(db, user), **_org_header(org)}


async def _admit(
    db: AsyncSession,
    pairing: PrintixPairing,
    ticket: Any,
    at: datetime,
    *,
    offline_synced_at: datetime | None = None,
) -> None:
    """Stamp the ticket and log the admission. ``offline_synced_at`` makes it an offline
    admission: ``at`` is the phone's time and the log row's time is the later sync."""
    ticket.admitted_at = at
    ticket.admitted_gate = pairing.gate
    ticket.admitted_pairing = pairing.id
    db.add(
        PrintixScanLog(
            id=uuid.uuid4(),
            pairing_id=pairing.id,
            ticket_id=ticket.id,
            outcome="admitted",
            value=ticket.barcode_value,
            scanned_at=offline_synced_at or at,
            offline_scanned_at=at if offline_synced_at else None,
            client_ref=uuid.uuid4() if offline_synced_at else None,
        )
    )
    await db.commit()


async def _log(
    db: AsyncSession,
    pairing: PrintixPairing,
    outcome: str,
    at: datetime,
    *,
    ticket: Any = None,
    value: str = "x",
    typed: bool = False,
    offline_at: datetime | None = None,
) -> None:
    db.add(
        PrintixScanLog(
            id=uuid.uuid4(),
            pairing_id=pairing.id,
            ticket_id=ticket.id if ticket is not None else None,
            outcome=outcome,
            value=value,
            typed=typed,
            scanned_at=at,
            offline_scanned_at=offline_at,
            client_ref=uuid.uuid4() if offline_at else None,
        )
    )
    await db.commit()


async def _seed(db: AsyncSession, event: PrintixEvent) -> dict[str, Any]:
    """Nine tickets, three gate phones (one never scanned) and a mixed scan log."""
    base = _base()
    gate_a, _ = await make_pairing(db, event, gate="Gate A")
    gate_b, _ = await make_pairing(db, event, gate="Gate B")
    gate_c, _ = await make_pairing(db, event, gate="Gate C")
    tickets = [
        await make_ticket(db, event, f"{n:03d}", f"{SECRET_PREFIX}{n:03d}-0000")
        for n in range(1, 9)
    ]
    void = await make_ticket(
        db, event, "900", f"{SECRET_PREFIX}900-0000", status="void"
    )
    minute = timedelta(minutes=1)
    # Gate A: three in the first five minutes, one two minutes ago.
    await _admit(db, gate_a, tickets[0], base + minute)
    await _admit(db, gate_a, tickets[1], base + 2 * minute)
    await _admit(db, gate_a, tickets[2], base + 3 * minute)
    recent = utc_now() - 2 * minute
    await _admit(db, gate_a, tickets[6], recent)
    # Gate B: one in the second bucket, one at 22 minutes, one offline at 23 minutes
    # synced half an hour later.
    await _admit(db, gate_b, tickets[3], base + 7 * minute)
    await _admit(db, gate_b, tickets[4], base + 22 * minute)
    await _admit(
        db,
        gate_b,
        tickets[5],
        base + 23 * minute,
        offline_synced_at=base + 53 * minute,
    )
    # Refusals.
    await _log(db, gate_a, "already_admitted", base + 10 * minute, ticket=tickets[0])
    await _log(
        db,
        gate_a,
        "already_admitted",
        base + 11 * minute,
        ticket=tickets[1],
        typed=True,
    )
    await _log(db, gate_b, "void", base + 12 * minute, ticket=void)
    await _log(
        db, gate_b, "unknown", base + 13 * minute, value="UNKNOWN-BARCODE-VALUE-9"
    )
    await _log(
        db,
        gate_b,
        "already_admitted",
        base + 53 * minute,
        ticket=tickets[0],
        offline_at=base + 30 * minute,
    )
    return {
        "base": base,
        "recent": recent,
        "tickets": tickets,
        "void": void,
        "gate_c_id": gate_c.id,
    }


async def _get(
    client: httpx.AsyncClient, event: PrintixEvent, route: str, headers: dict[str, str]
) -> httpx.Response:
    return await client.get(f"{ORG}/events/{event.id}/{route}", headers=headers)


# --- The numbers -------------------------------------------------------------------


async def test_analytics_counts_a_seeded_scan_log_with_offline_syncs(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    seeded = await _seed(db_async, world["ev_a"])
    headers = await _headers(db_async, world["org_a"])
    response = await _get(async_client, world["ev_a"], "analytics", headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()

    assert body["timezone"] == "America/Grenada"
    assert (body["issued"], body["void"], body["admitted"], body["not_yet_in"]) == (
        9,
        1,
        7,
        1,
    )
    assert body["no_show_rate"] == 0.125
    base = seeded["base"]
    assert body["first_admission_at"].startswith(
        (base + timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M")
    )
    assert body["admitted_last_10_minutes"] == 1
    assert body["entry_rate_per_minute"] == 0.1

    starts = {item["starts_at"][:16]: item["admitted"] for item in body["arrivals"]}
    assert starts[base.strftime("%Y-%m-%dT%H:%M")] == 3
    assert starts[(base + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M")] == 1
    # Empty periods between the first and last admission are present, as zero.
    assert starts[(base + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M")] == 0
    assert sum(starts.values()) == 7
    assert all(item["starts_at"].endswith("Z") for item in body["arrivals"])

    assert body["busiest_5_minutes"]["admitted"] == 3
    assert body["busiest_15_minutes"]["admitted"] == 4
    assert body["busiest_15_minutes"]["minutes"] == 15
    assert body["busiest_15_minutes"]["starts_at"].startswith(
        base.strftime("%Y-%m-%dT%H:%M")
    )

    gates = {gate["gate"]: gate for gate in body["gates"]}
    assert list(gates) == ["Gate A", "Gate B", "Gate C"]
    assert gates["Gate A"]["admitted"] == 4
    assert gates["Gate A"]["refused"] == 2
    assert gates["Gate A"]["typed_scans"] == 1
    assert gates["Gate A"]["typed_share"] == pytest.approx(1 / 6, abs=1e-4)
    assert gates["Gate A"]["admitted_share"] == pytest.approx(4 / 7, abs=1e-4)
    assert gates["Gate B"]["admitted"] == 3
    assert gates["Gate B"]["refused"] == 3
    assert gates["Gate B"]["typed_share"] == 0
    # A phone that never scanned is listed, with no last scan time.
    assert gates["Gate C"]["last_scan_at"] is None
    assert gates["Gate C"]["scans"] == 0
    assert gates["Gate C"]["typed_share"] is None
    assert gates["Gate C"]["phones"] == [
        {"id": str(seeded["gate_c_id"]), "last_scan_at": None, "active": True}
    ]
    # Gate B's latest scan is the offline conflict made at the phone's time, 30
    # minutes in, not the later moment it was synced.
    assert gates["Gate B"]["last_scan_at"].startswith(
        (base + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M")
    )

    refusals = {item["reason"]: item["count"] for item in body["refusals"]}
    assert refusals == {
        "already_admitted": 3,
        "void": 1,
        "unknown": 1,
        "event_closed": 0,
    }
    assert body["offline"] == {
        "synced_late": 1,
        "conflicts": 1,
        "longest_delay_seconds": 1800,
    }


async def test_an_event_with_no_scans_has_empty_but_complete_analytics(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    headers = await _headers(db_async, world["org_a"])
    body = (await _get(async_client, world["ev_a"], "analytics", headers)).json()
    assert body["admitted"] == 0
    assert body["no_show_rate"] is None
    assert body["arrivals"] == []
    assert body["busiest_5_minutes"] is None
    assert body["busiest_15_minutes"] is None
    assert body["gates"] == []
    assert [item["count"] for item in body["refusals"]] == [0, 0, 0, 0]
    assert body["offline"]["longest_delay_seconds"] is None


async def test_arrivals_keep_only_the_latest_day(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    event = world["ev_a"]
    pairing, _ = await make_pairing(db_async, event)
    first = await make_ticket(db_async, event, "001", f"{SECRET_PREFIX}1-0000")
    last = await make_ticket(db_async, event, "002", f"{SECRET_PREFIX}2-0000")
    now = utc_now().replace(second=0, microsecond=0)
    await _admit(db_async, pairing, first, now - timedelta(days=3))
    await _admit(db_async, pairing, last, now - timedelta(minutes=1))
    headers = await _headers(db_async, world["org_a"])
    body = (await _get(async_client, event, "analytics", headers)).json()
    assert len(body["arrivals"]) == 288
    assert sum(item["admitted"] for item in body["arrivals"]) == 1


async def test_recent_scans_are_paged_newest_first_without_barcodes(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    await _seed(db_async, world["ev_a"])
    headers = await _headers(db_async, world["org_a"])
    page = await _get(async_client, world["ev_a"], "scans?size=5", headers)
    assert page.status_code == 200
    assert page.headers["cache-control"] == "no-store"
    body = page.json()
    assert (body["total"], body["page"], body["size"]) == (12, 1, 5)
    assert len(body["items"]) == 5
    times = [item["scanned_at"] for item in body["items"]]
    assert times == sorted(times, reverse=True)
    assert body["items"][0]["gate"] == "Gate A"  # the admission two minutes ago
    assert body["items"][0]["outcome"] == "admitted"
    assert body["items"][0]["printed_number"] == "007"

    everything = (
        await _get(async_client, world["ev_a"], "scans?size=100", headers)
    ).json()["items"]
    unknown = next(item for item in everything if item["outcome"] == "unknown")
    assert unknown["printed_number"] is None
    typed = [item for item in everything if item["typed"]]
    assert len(typed) == 1
    assert sum(1 for item in everything if item["offline"]) == 2
    assert SECRET_PREFIX not in page.text
    assert "UNKNOWN-BARCODE" not in str(everything)
    assert SECRET_PREFIX not in str(everything)
    second = (
        await _get(async_client, world["ev_a"], "scans?size=5&page=3", headers)
    ).json()
    assert len(second["items"]) == 2


@pytest.mark.parametrize("size", ["0", "101"])
async def test_scan_page_size_is_bounded(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    size: str,
) -> None:
    headers = await _headers(db_async, world["org_a"])
    response = await _get(async_client, world["ev_a"], f"scans?size={size}", headers)
    assert response.status_code == 422


# --- CSV ---------------------------------------------------------------------------


async def test_the_csv_has_printed_numbers_only_and_neutralises_formulas(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    event = world["ev_a"]
    pairing, _ = await make_pairing(db_async, event, gate="=HYPERLINK(1)")
    now = utc_now().replace(microsecond=0)
    numbers = ["=1+1", "+5", "-7", "@SUM", "042"]
    for index, number in enumerate(numbers):
        ticket = await make_ticket(
            db_async, event, number, f"{SECRET_PREFIX}{index}-0000"
        )
        await _admit(db_async, pairing, ticket, now - timedelta(minutes=10 - index))
    await _log(db_async, pairing, "unknown", now, value="UNKNOWN-BARCODE-VALUE-9")
    headers = await _headers(db_async, world["org_a"])

    response = await _get(async_client, event, "scans/export", headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert SECRET_PREFIX not in response.text
    assert "UNKNOWN-BARCODE" not in response.text
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["time", "gate", "printed_number", "outcome", "entry", "offline"]
    assert rows[-1] == ["# end", "6 rows"]
    body = rows[1:-1]
    assert len(body) == 6
    assert [row[2] for row in body[:5]] == ["'=1+1", "'+5", "'-7", "'@SUM", "042"]
    assert {row[1] for row in body} == {"'=HYPERLINK(1)"}
    assert body[-1][3] == "unknown" and body[-1][2] == ""
    assert body[0][0].endswith("-04:00")  # Grenada clock
    assert {row[4] for row in body} == {"scanned"}
    for row in body:
        assert not row[0].startswith(("=", "+", "-", "@"))
        assert row[2][:1] not in {"=", "+", "@"} or row[2].startswith("'")


async def test_the_csv_streams_an_empty_log_as_a_header_row(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    headers = await _headers(db_async, world["org_a"])
    response = await _get(async_client, world["ev_a"], "scans/export", headers)
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines == ["time,gate,printed_number,outcome,entry,offline", "# end,0 rows"]


# --- Access ------------------------------------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("role_key", ["printix-organiser", "printix-gate-lead"])
async def test_both_bundles_may_read_the_dashboard(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    route: str,
    role_key: str,
) -> None:
    headers = await _headers(db_async, world["org_a"], role_key)
    assert (await _get(async_client, world["ev_a"], route, headers)).status_code == 200


@pytest.mark.parametrize("route", ROUTES)
async def test_a_member_without_a_printix_key_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    route: str,
) -> None:
    user = await _organiser(db_async, world["org_a"], None)
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_a"])}
    assert (await _get(async_client, world["ev_a"], route, headers)).status_code == 403


@pytest.mark.parametrize("route", ROUTES)
async def test_a_session_without_the_authenticator_step_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    route: str,
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {
        **await _sign_in(db_async, user, mfa=False),
        **_org_header(world["org_a"]),
    }
    assert (await _get(async_client, world["ev_a"], route, headers)).status_code == 403


@pytest.mark.parametrize("route", ROUTES)
async def test_another_organisations_event_and_an_unowned_one_are_404(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    route: str,
) -> None:
    headers = await _headers(db_async, world["org_a"])
    assert (await _get(async_client, world["ev_b"], route, headers)).status_code == 404
    assert (
        await _get(async_client, world["ev_none"], route, headers)
    ).status_code == 404
    missing = await async_client.get(
        f"{ORG}/events/{uuid.uuid4()}/{route}", headers=headers
    )
    assert missing.status_code == 404


@pytest.mark.parametrize("route", ROUTES)
async def test_a_non_member_account_session_and_a_missing_header_are_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    route: str,
) -> None:
    outsider = await _app_user(db_async)
    outsider_headers = {
        **await _sign_in(db_async, outsider),
        **_org_header(world["org_a"]),
    }
    assert (
        await _get(async_client, world["ev_a"], route, outsider_headers)
    ).status_code == 404
    member = await _organiser(db_async, world["org_a"], "printix-organiser")
    account = {
        **await _sign_in(db_async, member, app=None),
        **_org_header(world["org_a"]),
    }
    assert (await _get(async_client, world["ev_a"], route, account)).status_code == 403
    no_header = await _sign_in(db_async, member)
    assert (
        await _get(async_client, world["ev_a"], route, no_header)
    ).status_code == 400


async def test_the_dashboard_reads_share_the_read_limit_and_the_export_has_its_own(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    headers = await _headers(db_async, world["org_a"])
    statuses = [
        (await _get(async_client, world["ev_a"], "scans/export", headers)).status_code
        for _ in range(7)
    ]
    assert statuses == [200] * 6 + [429]
    # The export bucket is separate: ordinary reads still work.
    assert (
        await _get(async_client, world["ev_a"], "analytics", headers)
    ).status_code == 200
    reads = [
        (await _get(async_client, world["ev_a"], "scans", headers)).status_code
        for _ in range(120)
    ]
    assert reads.count(429) >= 1


async def test_closed_events_stay_readable(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    event = await make_event(db_async, name="Done", status="closed")
    event.organisation_id = world["org_a"].id
    await db_async.commit()
    headers = await _headers(db_async, world["org_a"])
    for route in ROUTES:
        assert (await _get(async_client, event, route, headers)).status_code == 200


async def test_the_csv_also_neutralises_formulas_hidden_behind_spaces(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    event = world["ev_a"]
    pairing, _ = await make_pairing(db_async, event, gate="  =cmd|' /C calc'!A0")
    ticket = await make_ticket(db_async, event, " @SUM(1)", f"{SECRET_PREFIX}9-0000")
    await _admit(db_async, pairing, ticket, utc_now() - timedelta(minutes=1))
    headers = await _headers(db_async, world["org_a"])
    response = await _get(async_client, event, "scans/export", headers)
    row = list(csv.reader(io.StringIO(response.text)))[1]
    assert row[1].startswith("'")
    assert row[2] == "' @SUM(1)"


def test_csv_cell_handles_every_leader_and_leaves_plain_text_alone() -> None:
    for value in ("=1", "+1", "-1", "@a", "\tx", "\rx", " =1", "\n+1", "\u00a0@x"):
        assert csv_cell(value).startswith("'"), value
    for plain in ("Gate 1", "042", "a=b", "", None, " plain"):
        assert not csv_cell(plain).startswith("'"), plain


async def test_an_event_with_too_many_scans_is_refused_with_a_clear_message(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed(db_async, world["ev_a"])
    monkeypatch.setattr(analytics_module, "EXPORT_MAX_ROWS", 5)
    headers = await _headers(db_async, world["org_a"])
    response = await _get(async_client, world["ev_a"], "scans/export", headers)
    assert response.status_code == 413
    assert "more than the 5" in response.json()["detail"]


async def test_the_page_reads_the_newest_scans_of_every_gate_phone(
    async_client: httpx.AsyncClient, db_async: AsyncSession, world: dict[str, Any]
) -> None:
    await _seed(db_async, world["ev_a"])
    headers = await _headers(db_async, world["org_a"])
    pages = []
    for number in (1, 2, 3):
        body = (
            await _get(
                async_client, world["ev_a"], f"scans?size=5&page={number}", headers
            )
        ).json()
        pages.extend(body["items"])
    times = [item["scanned_at"] for item in pages]
    assert len(pages) == 12 and len({item["id"] for item in pages}) == 12
    assert times == sorted(times, reverse=True)


async def test_the_scans_page_matches_a_plain_ordered_offset_query(
    db_async: AsyncSession, world: dict[str, Any]
) -> None:
    """Tied times on two gate phones, live and offline rows, every page and one past the end."""
    event = world["ev_a"]
    phone_a, _ = await make_pairing(db_async, event, gate="Gate A")
    phone_b, _ = await make_pairing(db_async, event, gate="Gate B")
    base = utc_now().replace(microsecond=0) - timedelta(hours=2)
    for step in range(9):
        at = base + timedelta(minutes=step // 2)  # neighbours tie within a phone too
        for phone in (phone_a, phone_b):
            await _log(db_async, phone, "unknown", at)
    for phone in (phone_a, phone_b):
        for minute in range(3):
            # Synced an hour later, but made at a time that ties with a live scan.
            await _log(
                db_async,
                phone,
                "unknown",
                base + timedelta(hours=1),
                offline_at=base + timedelta(minutes=minute),
            )
    happened = func.coalesce(
        PrintixScanLog.offline_scanned_at, PrintixScanLog.scanned_at
    )
    size = 7
    for page in (1, 2, 3, 4, 5):
        expected = (
            await db_async.scalars(
                select(PrintixScanLog.id)
                .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
                .where(PrintixPairing.event_id == event.id)
                .order_by(happened.desc(), PrintixScanLog.id.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        ).all()
        result = await analytics_module.list_scans(
            db_async, event.id, page=page, size=size
        )
        assert [item.id for item in result.items] == list(expected), page
        assert result.total == 24
    last = await analytics_module.list_scans(db_async, event.id, page=4, size=size)
    assert len(last.items) == 3
    beyond = await analytics_module.list_scans(db_async, event.id, page=5, size=size)
    assert beyond.items == []
