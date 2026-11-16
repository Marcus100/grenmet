"""Offline scanning: the ticket list a phone downloads, and syncing its queued admissions.

The server stays the source of truth. A phone that admitted tickets while offline
sends them later; the first admission the server records wins, and every other one
is reported back as a conflict (already admitted, void, closed or unknown).
"""

import hashlib
import hmac
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import constants, service
from src.printix.models import PrintixPairing, PrintixScanLog, PrintixTicket
from src.rate_limit import limiter
from src.utils.datetime import utc_now

from .support import (
    SCANNER,
    bearer,
    make_event,
    make_pairing,
    make_ticket,
    outcome_of,
    scan,
)

pytestmark = pytest.mark.usefixtures("db_async")

LIST = f"{SCANNER}/offline-tickets"
SYNC = f"{SCANNER}/offline-admissions"


def iso(moment: datetime) -> str:
    """A naive UTC datetime as the phone sends it: ISO 8601 with a zone."""
    return moment.replace(tzinfo=UTC).isoformat()


def item(
    value: str, scanned_at: datetime | None = None, ref: uuid.UUID | None = None
) -> dict[str, str]:
    return {
        "client_ref": str(ref or uuid.uuid4()),
        "value": value,
        "scanned_at": iso(scanned_at or utc_now() - timedelta(minutes=5)),
    }


async def sync(
    client: httpx.AsyncClient, secret: str, *items: dict[str, str]
) -> httpx.Response:
    return await client.post(
        SYNC, headers=bearer(secret), json={"admissions": list(items)}
    )


def results(response: httpx.Response) -> list[dict[str, Any]]:
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return list(body["results"])


async def stored(db: AsyncSession, ticket_id: uuid.UUID) -> PrintixTicket:
    ticket = await db.get(PrintixTicket, ticket_id, populate_existing=True)
    assert ticket is not None
    return ticket


def expected_hash(key: str, value: str) -> str:
    digest = hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()
    return digest[: constants.OFFLINE_HASH_HEX_LENGTH]


# --- The ticket list --------------------------------------------------------


async def test_the_list_carries_keyed_hashes_and_never_a_barcode(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    other = await make_event(db_async, name="Other")
    await make_ticket(db_async, event, "001", barcode="PXSECRETBAR0001")
    await make_ticket(db_async, event, "002", barcode="PXSECRETBAR0002", status="void")
    await make_ticket(db_async, other, "003", barcode="PXSECRETBAR0003")
    _, secret = await make_pairing(db_async, event)

    response = await async_client.get(LIST, headers=bearer(secret))

    assert response.status_code == 200
    assert "PXSECRETBAR" not in response.text
    body = response.json()
    assert body["event"]["id"] == str(event.id)
    key = body["hash_key"]
    tickets = {t["printed_number"]: t for t in body["tickets"]}
    assert set(tickets) == {"001", "002"}
    assert tickets["001"]["barcode_hash"] == expected_hash(key, "PXSECRETBAR0001")
    assert tickets["001"]["state"] == "valid"
    assert tickets["002"]["state"] == "void"
    assert body["generated_at"].endswith("Z")


async def test_the_list_marks_admitted_tickets_with_their_time_and_gate(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, secret = await make_pairing(db_async, event, gate="North")
    await scan(async_client, secret, "PXBARCODE0001")

    body = (await async_client.get(LIST, headers=bearer(secret))).json()

    (ticket,) = body["tickets"]
    assert ticket["state"] == "admitted"
    assert ticket["admitted_gate"] == "North"
    assert ticket["admitted_at"].endswith("Z")


async def test_each_pairing_gets_its_own_hash_key(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, first = await make_pairing(db_async, event, gate="North")
    _, second = await make_pairing(db_async, event, gate="South")

    a = (await async_client.get(LIST, headers=bearer(first))).json()
    b = (await async_client.get(LIST, headers=bearer(second))).json()

    assert a["hash_key"] != b["hash_key"]
    assert a["tickets"][0]["barcode_hash"] != b["tickets"][0]["barcode_hash"]


async def test_the_list_needs_a_live_pairing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    pairing, secret = await make_pairing(db_async, event)

    assert (await async_client.get(LIST)).status_code == 401
    await service.revoke_pairing(db_async, pairing.id, actor_id=None)
    assert (await async_client.get(LIST, headers=bearer(secret))).status_code == 403


# --- Syncing queued admissions ----------------------------------------------


async def test_an_offline_admission_is_recorded_at_the_phone_time(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event, gate="North")
    # Paired before the signal went: phone times are kept after the pairing's creation.
    pairing.created_at = utc_now() - timedelta(hours=2)
    await db_async.commit()
    when = utc_now() - timedelta(minutes=10)

    (result,) = results(await sync(async_client, secret, item("PXBARCODE0001", when)))

    assert result["outcome"] == "admitted"
    assert result["printed_number"] == "001"
    assert result["admitted_gate"] == "North"
    saved = await stored(db_async, ticket.id)
    assert saved.admitted_at is not None
    assert abs((saved.admitted_at - when).total_seconds()) < 1
    assert saved.admitted_pairing == pairing.id
    log = await db_async.scalar(
        select(PrintixScanLog).where(PrintixScanLog.pairing_id == pairing.id)
    )
    assert log is not None
    assert log.offline_scanned_at is not None
    # The log's own time is when the server heard about it, so caps stay honest.
    assert log.scanned_at > when


async def test_a_ticket_admitted_online_first_is_a_conflict_for_the_offline_gate(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, north = await make_pairing(db_async, event, gate="North")
    _, south = await make_pairing(db_async, event, gate="South")
    assert outcome_of(await scan(async_client, north, "PXBARCODE0001")) == "admitted"

    (result,) = results(await sync(async_client, south, item("PXBARCODE0001")))

    assert result["outcome"] == "already_admitted"
    assert result["admitted_gate"] == "North"
    summary = (
        await async_client.get(f"{SCANNER}/summary", headers=bearer(north))
    ).json()
    assert summary["offline_conflicts"] == 1
    # The person was let in offline, so this is not a refused duplicate.
    assert summary["duplicates_refused"] == 0


async def test_two_offline_gates_with_the_same_ticket_first_to_sync_wins(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, north = await make_pairing(db_async, event, gate="North")
    _, south = await make_pairing(db_async, event, gate="South")

    (first,) = results(await sync(async_client, south, item("PXBARCODE0001")))
    (second,) = results(await sync(async_client, north, item("PXBARCODE0001")))

    assert first["outcome"] == "admitted"
    assert second["outcome"] == "already_admitted"
    assert second["admitted_gate"] == "South"


async def test_a_retried_sync_answers_the_same_and_logs_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event, gate="North")
    queued = item("PXBARCODE0001")

    (first,) = results(await sync(async_client, secret, queued))
    (again,) = results(await sync(async_client, secret, queued))

    assert first["outcome"] == again["outcome"] == "admitted"
    assert first["admitted_at"] == again["admitted_at"]
    rows = await db_async.scalar(
        select(func.count(PrintixScanLog.id)).where(
            PrintixScanLog.pairing_id == pairing.id
        )
    )
    assert rows == 1


async def test_phone_times_are_kept_between_pairing_creation_and_now(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    future = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    past = await make_ticket(db_async, event, "002", barcode="PXBARCODE0002")
    pairing, secret = await make_pairing(db_async, event)
    before = utc_now()

    results(
        await sync(
            async_client,
            secret,
            item("PXBARCODE0001", utc_now() + timedelta(hours=3)),
            item("PXBARCODE0002", utc_now() - timedelta(days=3)),
        )
    )

    late = await stored(db_async, future.id)
    early = await stored(db_async, past.id)
    assert late.admitted_at is not None
    assert early.admitted_at is not None
    assert late.admitted_at <= utc_now()
    assert late.admitted_at >= before - timedelta(seconds=1)
    assert early.admitted_at >= pairing.created_at


async def test_void_unknown_and_typed_numbers_are_reported(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001", status="void")
    await make_ticket(db_async, event, "002", barcode="PXBARCODE0002")
    _, secret = await make_pairing(db_async, event, allow_typed_numbers=True)

    outcomes = [
        r["outcome"]
        for r in results(
            await sync(
                async_client,
                secret,
                item("PXBARCODE0001"),
                item("NOT-A-TICKET"),
                # Offline admission is by barcode only; a typed number is not looked up.
                item("002"),
            )
        )
    ]

    assert outcomes == ["void", "unknown", "unknown"]


async def test_a_scan_after_close_is_event_closed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    closes = utc_now() + timedelta(minutes=1)
    event = await make_event(db_async, closes_at=closes)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, secret = await make_pairing(db_async, event)
    event.closes_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()

    (result,) = results(
        await sync(async_client, secret, item("PXBARCODE0001", utc_now()))
    )

    assert result["outcome"] == "event_closed"
    assert (await stored(db_async, ticket.id)).admitted_at is None


async def test_a_scan_before_close_is_admitted_when_synced_after_close(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async, closes_at=utc_now() + timedelta(hours=1))
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(hours=1)
    scanned = utc_now() - timedelta(seconds=30)
    event.closes_at = utc_now() - timedelta(seconds=5)
    await db_async.commit()

    (result,) = results(
        await sync(async_client, secret, item("PXBARCODE0001", scanned))
    )

    assert result["outcome"] == "admitted"


async def test_a_closed_event_refuses_offline_admissions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(hours=2)
    await db_async.commit()
    await service.close_event(db_async, event.id, actor_id=None)

    # A phone clock ahead of the server is clamped to server time, which is after the close.
    (result,) = results(
        await sync(
            async_client, secret, item("PXBARCODE0001", utc_now() + timedelta(hours=1))
        )
    )

    assert result["outcome"] == "event_closed"
    assert (await stored(db_async, ticket.id)).admitted_at is None


async def test_a_scan_before_the_close_counts_even_when_synced_after_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event, gate="North")
    pairing.created_at = utc_now() - timedelta(hours=2)
    await db_async.commit()
    scanned = utc_now() - timedelta(minutes=10)
    await service.close_event(db_async, event.id, actor_id=None)

    (result,) = results(
        await sync(async_client, secret, item("PXBARCODE0001", scanned))
    )

    assert result["outcome"] == "admitted"
    saved = await stored(db_async, ticket.id)
    assert saved.admitted_at is not None
    assert abs((saved.admitted_at - scanned).total_seconds()) < 1


async def test_the_close_is_a_strict_cutoff_for_offline_scans(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    await make_ticket(db_async, event, "002", barcode="PXBARCODE0002")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(hours=2)
    closed = utc_now() - timedelta(minutes=1)
    event.status = "closed"
    event.closed_at = closed
    await db_async.commit()

    outcomes = [
        r["outcome"]
        for r in results(
            await sync(
                async_client,
                secret,
                item("PXBARCODE0001", closed - timedelta(seconds=1)),
                item("PXBARCODE0002", closed),
            )
        )
    ]

    assert outcomes == ["admitted", "event_closed"]


async def test_a_closed_event_with_no_recorded_close_refuses_offline_admissions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Its close time is unknown, so no offline scan can be shown to be before it."""
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(hours=2)
    event.status = "closed"
    await db_async.commit()

    (result,) = results(
        await sync(
            async_client,
            secret,
            item("PXBARCODE0001", utc_now() - timedelta(minutes=10)),
        )
    )

    assert result["outcome"] == "event_closed"
    assert (await stored(db_async, ticket.id)).admitted_at is None


# --- Barcodes that are printed numbers --------------------------------------


async def test_the_list_is_refused_when_a_barcode_is_its_printed_number(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """A three-digit barcode's hash can be reversed by trying every number."""
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    await make_ticket(db_async, event, "002")  # barcode defaults to the printed number
    _, secret = await make_pairing(db_async, event)

    response = await async_client.get(LIST, headers=bearer(secret))

    assert response.status_code == 409
    assert response.json()["code"] == "offline_not_available"


async def test_offline_sync_is_refused_when_a_barcode_is_its_printed_number(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")  # barcode defaults to the printed number
    await make_ticket(db_async, event, "002", barcode="PXBARCODE0002")
    pairing, secret = await make_pairing(db_async, event)

    response = await sync(async_client, secret, item("PXBARCODE0002"))

    assert response.status_code == 409
    assert response.json()["code"] == "offline_not_available"
    logged = await db_async.scalar(
        select(func.count(PrintixScanLog.id)).where(
            PrintixScanLog.pairing_id == pairing.id
        )
    )
    assert logged == 0


async def test_live_scans_still_admit_on_such_an_event(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The refusal is for offline use only; the online scanner is unchanged."""
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)

    assert outcome_of(await scan(async_client, secret, "001")) == "admitted"


# --- Caps and limits --------------------------------------------------------


async def test_offline_rows_do_not_use_up_the_online_scan_cap(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(constants, "SCANS_PER_WINDOW", 3)
    event = await make_event(db_async)
    for n in range(1, 6):
        await make_ticket(db_async, event, f"00{n}", barcode=f"PXBARCODE000{n}")
    _, secret = await make_pairing(db_async, event)

    synced = results(
        await sync(
            async_client, secret, *(item(f"PXBARCODE000{n}") for n in range(1, 5))
        )
    )

    assert [r["outcome"] for r in synced] == ["admitted"] * 4
    assert outcome_of(await scan(async_client, secret, "PXBARCODE0005")) == "admitted"


async def test_unknowns_past_the_cap_are_deferred_not_answered(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(constants, "UNKNOWN_SCANS_PER_WINDOW", 2)
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    batch = [item("NOPE-1"), item("NOPE-2"), item("NOPE-3"), item("PXBARCODE0001")]

    response = await sync(async_client, secret, *batch)

    body = response.json()
    assert [r["outcome"] for r in body["results"]] == ["unknown", "unknown"]
    assert body["deferred"] == 2
    assert body["retry_after_seconds"] == constants.SCAN_WINDOW_SECONDS
    logged = await db_async.scalar(
        select(func.count(PrintixScanLog.id)).where(
            PrintixScanLog.pairing_id == pairing.id
        )
    )
    assert logged == 2


@pytest.mark.parametrize(
    "admissions",
    [
        [],
        [item(f"V{n}") for n in range(constants.OFFLINE_SYNC_BATCH_MAX + 1)],
        [item("A\x00B")],
    ],
    ids=["empty", "too-many", "control-character"],
)
async def test_bad_batches_are_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    admissions: list[dict[str, str]],
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    response = await async_client.post(
        SYNC, headers=bearer(secret), json={"admissions": admissions}
    )

    assert response.status_code == 422


async def test_a_repeated_reference_in_one_batch_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)
    ref = uuid.uuid4()

    response = await sync(async_client, secret, item("A", ref=ref), item("B", ref=ref))

    assert response.status_code == 422


async def test_references_are_per_pairing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Another pairing reusing a reference does not read this pairing's answer."""
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, north = await make_pairing(db_async, event, gate="North")
    _, south = await make_pairing(db_async, event, gate="South")
    ref = uuid.uuid4()

    (first,) = results(await sync(async_client, north, item("PXBARCODE0001", ref=ref)))
    (second,) = results(await sync(async_client, south, item("NOPE", ref=ref)))

    assert first["outcome"] == "admitted"
    assert second["outcome"] == "unknown"


async def test_sync_needs_a_live_pairing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    pairing, secret = await make_pairing(db_async, event)
    pairing_row = await db_async.get(PrintixPairing, pairing.id)
    assert pairing_row is not None
    pairing_row.expires_at = utc_now() - timedelta(seconds=1)
    await db_async.commit()

    assert (
        await async_client.post(SYNC, json={"admissions": [item("X")]})
    ).status_code == 401
    assert (await sync(async_client, secret, item("X"))).status_code == 403


async def test_no_value_or_secret_reaches_the_log(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXLOGBAR0001")
    _, secret = await make_pairing(db_async, event)

    with caplog.at_level(logging.DEBUG):
        await async_client.get(LIST, headers=bearer(secret))
        await sync(async_client, secret, item("PXLOGBAR0001"), item("PXLOGNOPE"))

    assert "PXLOG" not in caplog.text
    assert secret not in caplog.text


def test_the_offline_routes_carry_their_limits() -> None:
    """Each: the address cap and a per-pairing cap keyed on the secret's hash."""
    listing = "src.printix.scanner_router.offline_tickets_endpoint"
    syncing = "src.printix.scanner_router.offline_admissions_endpoint"

    assert len(limiter._route_limits[listing]) == 2
    assert len(limiter._route_limits[syncing]) == 2


@pytest.fixture
def limits_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(limiter, "enabled", True)


@pytest.mark.usefixtures("limits_on")
async def test_the_list_is_limited_per_pairing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    statuses = [
        (await async_client.get(LIST, headers=bearer(secret))).status_code
        for _ in range(constants.OFFLINE_LIST_READS_PER_MINUTE + 1)
    ]

    assert statuses[:-1] == [200] * constants.OFFLINE_LIST_READS_PER_MINUTE
    assert statuses[-1] == 429


# --- Offline results that are not admissions --------------------------------


async def test_non_admissions_are_capped_per_window_and_the_rest_deferred(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Repeats of an admitted barcode write rows; past the cap the rest is deferred."""
    monkeypatch.setattr(constants, "OFFLINE_NON_ADMISSIONS_PER_WINDOW", 3)
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    (first,) = results(await sync(async_client, secret, item("PXBARCODE0001")))
    assert first["outcome"] == "admitted"

    response = await sync(
        async_client, secret, *(item("PXBARCODE0001") for _ in range(6))
    )

    assert response.status_code == 200
    body = response.json()
    assert [r["outcome"] for r in body["results"]] == ["already_admitted"] * 3
    assert body["deferred"] == 3
    assert body["retry_after_seconds"] == constants.SCAN_WINDOW_SECONDS
    logged = await db_async.scalar(
        select(func.count(PrintixScanLog.id)).where(
            PrintixScanLog.pairing_id == pairing.id
        )
    )
    assert logged == 4


async def test_genuine_admissions_are_not_throttled_by_the_non_admission_cap(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With no non-admission allowed at all, new admissions still go through."""
    monkeypatch.setattr(constants, "OFFLINE_NON_ADMISSIONS_PER_WINDOW", 0)
    event = await make_event(db_async)
    for n in range(1, 5):
        await make_ticket(db_async, event, f"00{n}", barcode=f"PXBARCODE000{n}")
    _, secret = await make_pairing(db_async, event)

    response = await sync(
        async_client, secret, *(item(f"PXBARCODE000{n}") for n in range(1, 5))
    )

    assert response.status_code == 200
    body = response.json()
    assert [r["outcome"] for r in body["results"]] == ["admitted"] * 4
    assert body["deferred"] == 0


# --- Grace period after the close -------------------------------------------


async def test_a_sync_later_than_the_grace_period_after_close_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """A scan dated before the close cannot be used to sync long after it."""
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(days=2)
    closed = utc_now() - (constants.OFFLINE_SYNC_GRACE_AFTER_CLOSE + timedelta(hours=1))
    event.status = "closed"
    event.closed_at = closed
    await db_async.commit()

    (result,) = results(
        await sync(
            async_client, secret, item("PXBARCODE0001", closed - timedelta(minutes=10))
        )
    )

    assert result["outcome"] == "event_closed"
    assert (await stored(db_async, ticket.id)).admitted_at is None


async def test_a_scan_before_the_close_counts_within_the_grace_period(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.created_at = utc_now() - timedelta(days=2)
    closed = utc_now() - timedelta(hours=1)
    event.status = "closed"
    event.closed_at = closed
    await db_async.commit()

    (result,) = results(
        await sync(
            async_client, secret, item("PXBARCODE0001", closed - timedelta(minutes=10))
        )
    )

    assert result["outcome"] == "admitted"
    assert (await stored(db_async, ticket.id)).admitted_at is not None


# --- Bounds on scanned_at ---------------------------------------------------


@pytest.mark.parametrize(
    "stamp",
    [
        "0001-01-01T00:00:00+01:00",
        "0001-01-01T00:00:00Z",
        "2019-12-31T23:59:59Z",
        "9999-12-31T23:59:59-23:59",
    ],
)
async def test_a_scanned_time_outside_the_bounds_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stamp: str
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, secret = await make_pairing(db_async, event)
    body = {
        "admissions": [
            {
                "client_ref": str(uuid.uuid4()),
                "value": "PXBARCODE0001",
                "scanned_at": stamp,
            }
        ]
    }

    response = await async_client.post(SYNC, headers=bearer(secret), json=body)

    assert response.status_code == 422


async def test_a_scanned_time_more_than_a_day_ahead_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="PXBARCODE0001")
    _, secret = await make_pairing(db_async, event)

    response = await sync(
        async_client, secret, item("PXBARCODE0001", utc_now() + timedelta(days=2))
    )

    assert response.status_code == 422


# --- Barcode length ---------------------------------------------------------


async def test_the_list_is_refused_when_a_barcode_is_shorter_than_twelve(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="SHORT11CHAR")  # 11 characters
    pairing, secret = await make_pairing(db_async, event)

    listing = await async_client.get(LIST, headers=bearer(secret))
    syncing = await sync(async_client, secret, item("SHORT11CHAR"))

    assert listing.status_code == 409
    assert listing.json()["code"] == "offline_not_available"
    assert syncing.status_code == 409
    assert syncing.json()["code"] == "offline_not_available"


async def test_a_twelve_character_barcode_is_allowed_offline(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="ABCDEFGHIJKL")  # 12 characters
    _, secret = await make_pairing(db_async, event)

    response = await async_client.get(LIST, headers=bearer(secret))

    assert response.status_code == 200
