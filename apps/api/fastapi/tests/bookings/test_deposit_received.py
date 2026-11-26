"""Staff mark a deposit paid to the business as received, and undo it (issue #1869).

No money moves through Barrels: the booking records the method, an optional
reference and the arrival time. The customer's manage page and later mails show the
deposit as received, the calendar SEQUENCE is unchanged, and every change is audited.
"""

import uuid
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.bookings.models import BookingEvent
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from src.utils.datetime import utc_now
from tests.bookings.test_deposit_to_business import _booked, _business
from tests.bookings.test_manual_deposit import _unpaid
from tests.bookings.test_public_bookings import API, Studio, _emails
from tests.bookings.test_studio import _url
from tests.email_payload import payload_text
from tests.factories import make_user
from tests.organisations.support import headers_for


def _mark_url(booking_id: str) -> str:
    return _url(booking_id, "/deposit-received")


async def _mark(
    client: httpx.AsyncClient,
    studio: Studio,
    booking_id: str,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        _mark_url(booking_id),
        headers=headers or studio.headers,
        json=body if body is not None else {"method": "cash", "reference": "R-42"},
    )


async def _undo(
    client: httpx.AsyncClient, studio: Studio, booking_id: str
) -> httpx.Response:
    return await client.delete(_mark_url(booking_id), headers=studio.headers)


async def _business_booking(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, str, str]:
    """A business-mode booking: returns the studio, the booking id and the manage
    token."""
    studio = await _business(db, client, **profile)
    receipt = await _booked(client, studio)
    return studio, receipt["booking"]["id"], receipt["manage_token"]


async def _audit_actions(db: AsyncSession, booking_id: str) -> list[str]:
    rows = await db.scalars(
        select(AuditEntry)
        .where(AuditEntry.entity_id == booking_id)
        .order_by(AuditEntry.created_at)
        .execution_options(populate_existing=True)
    )
    return [row.action for row in rows]


async def _ics_sequence(client: httpx.AsyncClient, token: str) -> tuple[str, str]:
    response = await client.get(f"{API}/public/bookings/{token}/ics")
    assert response.status_code == 200, response.text
    body = response.text
    sequence = next(line for line in body.splitlines() if line.startswith("SEQUENCE:"))
    return sequence, "\n".join(
        line for line in body.splitlines() if not line.startswith("DTSTAMP:")
    )


async def test_mark_records_method_reference_and_time_then_audits(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    when = (utc_now() - timedelta(hours=1)).replace(microsecond=0)
    response = await _mark(
        async_client,
        studio,
        booking_id,
        {
            "method": "bank_transfer",
            "reference": "  TRF-88  ",
            "received_at": when.isoformat() + "Z",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deposit_received_at"].startswith(when.isoformat()[:16])
    assert body["deposit_received_method"] == "bank_transfer"
    assert body["deposit_received_reference"] == "TRF-88"
    notes = [event["note"] for event in body["events"]]
    assert "Deposit received by bank transfer" in notes
    assert await _audit_actions(db_async, booking_id) == ["deposit_received"]


async def test_received_time_defaults_to_now(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    before = utc_now()
    response = await _mark(async_client, studio, booking_id, {"method": "paypal"})
    assert response.status_code == 200, response.text
    received = datetime.fromisoformat(
        response.json()["deposit_received_at"].replace("Z", "")
    )
    assert before - timedelta(seconds=5) <= received <= utc_now()
    assert response.json()["deposit_received_reference"] is None


async def test_undo_clears_the_receipt_and_audits_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    response = await _undo(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deposit_received_at"] is None
    assert body["deposit_received_method"] is None
    assert body["deposit_received_reference"] is None
    assert await _audit_actions(db_async, booking_id) == [
        "deposit_received",
        "deposit_undone",
    ]
    again = await _undo(async_client, studio, booking_id)
    assert again.status_code == 409
    assert again.json()["code"] == "DEPOSIT_NOT_RECEIVED"


async def test_a_plain_member_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    member = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers = headers_for(member, studio.org_id)
    marked = await _mark(async_client, studio, booking_id, headers=headers)
    assert marked.status_code == 403
    undone = await async_client.delete(_mark_url(booking_id), headers=headers)
    assert undone.status_code == 403
    assert await _audit_actions(db_async, booking_id) == []


async def test_a_booking_without_a_business_deposit_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # A deposit taken online (Barrels collects it) is not a business-held deposit.
    studio, booking_id = await _unpaid(db_async, async_client)
    response = await _mark(async_client, studio, booking_id)
    assert response.status_code == 409
    assert response.json()["code"] == "NO_BUSINESS_DEPOSIT"


async def test_a_closed_booking_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    cancelled = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Closed for the day"},
    )
    assert cancelled.status_code == 200, cancelled.text
    response = await _mark(async_client, studio, booking_id)
    assert response.status_code == 409
    assert response.json()["code"] == "BOOKING_NOT_OPEN"


async def test_marking_twice_is_a_conflict(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    response = await _mark(async_client, studio, booking_id)
    assert response.status_code == 409
    assert response.json()["code"] == "DEPOSIT_ALREADY_RECEIVED"
    assert await _audit_actions(db_async, booking_id) == ["deposit_received"]


async def test_a_future_arrival_time_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    later = (utc_now() + timedelta(days=1)).isoformat() + "Z"
    response = await _mark(
        async_client,
        studio,
        booking_id,
        {"method": "cash", "received_at": later},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "DEPOSIT_RECEIVED_IN_FUTURE"


async def test_the_manage_page_says_received_and_hides_the_method(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, token = await _business_booking(db_async, async_client)
    before = (await async_client.get(f"{API}/public/bookings/{token}")).json()
    assert before["deposit_received"] is False
    assert before["deposit_instructions"]
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    after = await async_client.get(f"{API}/public/bookings/{token}")
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["deposit_received"] is True
    assert body["deposit_instructions"] is None
    assert body["deposit_to_business_minor"] == before["deposit_to_business_minor"]
    assert "deposit_received_method" not in body
    assert "deposit_received_reference" not in body
    assert "R-42" not in after.text
    assert "cash" not in after.text


async def test_a_later_mail_says_the_deposit_was_received(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The confirmation mail is the one that carries the deposit lines.
    studio, booking_id, _token = await _business_booking(
        db_async, async_client, requires_confirmation=True
    )
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    confirmed = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert confirmed.status_code == 200, confirmed.text
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmed:"))
    text = payload_text(mail.payload)
    assert "Deposit received" in text
    assert "Deposit to pay" not in text
    assert "How to pay your deposit" not in text


async def test_the_calendar_sequence_does_not_change(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, token = await _business_booking(db_async, async_client)
    sequence_before, body_before = await _ics_sequence(async_client, token)
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    sequence_after, body_after = await _ics_sequence(async_client, token)
    assert sequence_after == sequence_before
    assert body_after == body_before
    assert (await _undo(async_client, studio, booking_id)).status_code == 200
    assert (await _ics_sequence(async_client, token))[0] == sequence_before
    # The history note is kept for staff, flagged so the feed does not count it.
    notes = list(
        await db_async.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == uuid.UUID(booking_id))
            .where(BookingEvent.note == "Deposit receipt undone")
            .execution_options(populate_existing=True)
        )
    )
    assert len(notes) == 1 and notes[0].staff_note is True


async def test_a_completed_booking_takes_its_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The business may take a cash deposit at the visit, after completing the booking.
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    completed = await async_client.post(
        f"{API}/org/bookings/{booking_id}/complete", headers=studio.headers
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"
    response = await _mark(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    assert response.json()["deposit_received_method"] == "cash"
    assert await _audit_actions(db_async, booking_id) == ["deposit_received"]


async def test_another_organisations_booking_is_not_found(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _token = await _business_booking(db_async, async_client)
    other = await _business(db_async, async_client)
    detail_url = f"{API}/org/bookings/{booking_id}"

    # Not yet marked: the other business can neither mark nor undo it.
    marked = await _mark(async_client, other, booking_id)
    assert marked.status_code == 404
    undone = await _undo(async_client, other, booking_id)
    assert undone.status_code == 404
    unchanged = await async_client.get(detail_url, headers=studio.headers)
    assert unchanged.json()["deposit_received_at"] is None
    assert await _audit_actions(db_async, booking_id) == []

    # Marked by its own business: the other business still cannot undo it.
    assert (await _mark(async_client, studio, booking_id)).status_code == 200
    undone = await _undo(async_client, other, booking_id)
    assert undone.status_code == 404
    still = await async_client.get(detail_url, headers=studio.headers)
    assert still.json()["deposit_received_at"] is not None
    assert still.json()["deposit_received_method"] == "cash"
    assert await _audit_actions(db_async, booking_id) == ["deposit_received"]
