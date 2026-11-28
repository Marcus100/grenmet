"""The one-off erasure backfill (#2028) clears what erasure learned later, for contacts
erased before those rules existed, and nothing else.

Each "erased before the rules" case erases through the real service (which clears
everything today), then puts the copies back with direct writes, which is the state
an earlier erasure left. Assertions read the database.
"""

import logging
import uuid
from collections.abc import Iterator

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contacts import erasure_backfill, references
from src.contacts import service as contacts_service
from src.contacts.erasure_backfill import ErasureBackfillError
from src.contacts.models import Contact
from src.database import async_session_factory
from src.notifications.models import OutboundEmail
from src.outbox import Outbox, OutboxStatus
from tests.bookings.test_erasure_clears_event_notes import _book_next, _contact_for
from tests.bookings.test_public_bookings import Studio, _studio
from tests.bookings.test_studio import _events
from tests.contacts.test_erasure_reaches_mail import (
    _contact,
    _org,
    _phone,
    _queue_delivery,
    _queue_outbox,
    _sent_row,
    _token,
)


@pytest.fixture
def records() -> Iterator[list[logging.LogRecord]]:
    """Capture on the backfill's own logger. caplog depends on test order (another test
    can switch propagation off), as tests/test_provider_health.py notes."""
    captured: list[logging.LogRecord] = []

    class _Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    target = logging.getLogger(erasure_backfill.__name__)
    handler = _Collect(level=logging.DEBUG)
    was_disabled, old_level = target.disabled, target.level
    target.disabled = False
    target.setLevel(logging.DEBUG)
    target.addHandler(handler)
    try:
        yield captured
    finally:
        target.removeHandler(handler)
        target.disabled = was_disabled
        target.setLevel(old_level)


def _messages(records: list[logging.LogRecord]) -> str:
    return " ".join(record.getMessage() for record in records)


LEFT_NAME = "Typed Name"
LEFT_NOTE = "Customer says the back door sticks"
LEFT_REASON = "Allergic to latex, 473-555-0123"
LEFT_EVENT_NOTE = "Staff: rang about the latex allergy"


async def _leave_copies(db: AsyncSession, booking_id: uuid.UUID) -> None:
    """Put back the copies an erasure from before the rules left on a booking."""
    booking = await db.get(Booking, booking_id)
    assert booking is not None
    booking.booked_name = LEFT_NAME
    booking.notes = LEFT_NOTE
    booking.cancel_reason = LEFT_REASON
    for event in await _events(db, str(booking_id)):
        event.note = LEFT_EVENT_NOTE
    await db.commit()


async def _erase_before_the_rules(
    db: AsyncSession, studio: Studio, email: str, booking_id: uuid.UUID
) -> None:
    """Erase a contact by today's rules, then restore the copies an earlier one left."""
    contact = await _contact_for(db, studio.org_id, email)
    await contacts_service.erase_contact(db, contact)
    await db.commit()
    await _leave_copies(db, booking_id)


async def _booking(db: AsyncSession, booking_id: uuid.UUID) -> Booking:
    db.expire_all()
    row = await db.get(Booking, booking_id)
    assert row is not None
    return row


async def _copy_count(db: AsyncSession) -> int:
    """Bookings still holding a copy of the typed name, notes or cancel reason."""
    db.expire_all()
    return int(
        await db.scalar(
            select(func.count(Booking.id)).where(
                (Booking.booked_name.is_not(None))
                | (Booking.notes.is_not(None))
                | (Booking.cancel_reason.is_not(None))
            )
        )
        or 0
    )


async def test_contact_erased_before_the_rules_loses_its_copies(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"gone-bf-{uuid.uuid4().hex[:8]}@example.com"
    kept = f"kept-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST gone")
    kept_booking = await _book_next(db_async, async_client, studio, kept, "TEST kept")
    await _erase_before_the_rules(db_async, studio, gone, gone_booking)
    await _leave_copies(db_async, kept_booking)  # a live customer, not erased
    cancelled_at = (await _booking(db_async, gone_booking)).cancelled_at

    result = await erasure_backfill.backfill_erased_copies(db_async)

    erased = await _booking(db_async, gone_booking)
    assert erased.booked_name is None
    assert erased.notes is None
    assert erased.cancel_reason is None
    assert erased.cancelled_at == cancelled_at
    events = await _events(db_async, str(gone_booking))
    assert events and all(event.note is None for event in events)
    assert result.contacts == 1
    assert result.booking_rows == 1
    assert result.booking_event_rows == len(events)
    assert result.contacts_remaining == 0


async def test_contact_erased_after_the_rules_is_a_no_op(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"after-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST after")
    await _leave_copies(db_async, gone_booking)
    contact = await _contact_for(db_async, studio.org_id, gone)
    await contacts_service.erase_contact(db_async, contact)  # today's rules
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async)

    assert result.contacts == 0
    assert result.booking_rows == 0
    assert result.booking_event_rows == 0
    assert result.order_rows == 0
    assert result.mail_rows == 0
    row = await _booking(db_async, gone_booking)
    assert row.booked_name is None and row.notes is None
    assert row.cancel_reason is None


async def test_a_live_contact_is_never_touched(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The failure that cannot be undone: clearing a live customer's record. A live
    contact keeps every copy, its mail is kept, and so is the mail of a business that
    has no erased contact at all."""
    studio = await _studio(db_async, async_client, providers=3)
    live = f"live-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone = f"gone-live-bf-{uuid.uuid4().hex[:8]}@example.com"
    live_booking = await _book_next(db_async, async_client, studio, live, "TEST live")
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST gone")
    await _leave_copies(db_async, live_booking)
    await _erase_before_the_rules(db_async, studio, gone, gone_booking)

    token = _token()
    other_org = await _org(db_async)
    live_mail = await _queue_outbox(
        db_async,
        studio.org_id,
        live,
        status=OutboxStatus.PENDING.value,
        name="TEST live",
        phone=_phone(),
    )
    other_email = f"other-bf-{token}@example.com"
    await _contact(db_async, other_org, other_email, "Other", _phone())
    other_mail = await _queue_outbox(
        db_async,
        other_org,
        other_email,
        status=OutboxStatus.PENDING.value,
        name="Other",
        phone=_phone(),
    )
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async)

    live_row = await _booking(db_async, live_booking)
    assert live_row.booked_name == LEFT_NAME
    assert live_row.notes == LEFT_NOTE
    assert live_row.cancel_reason == LEFT_REASON
    assert all(
        event.note == LEFT_EVENT_NOTE
        for event in await _events(db_async, str(live_booking))
    )
    live_contact = await _contact_for(db_async, studio.org_id, live)
    assert live_contact.erased_at is None and live_contact.name is not None
    assert await db_async.get(Outbox, live_mail) is not None
    assert await db_async.get(Outbox, other_mail) is not None
    assert result.contacts == 1
    assert result.mail_addresses == 0


async def test_a_second_run_changes_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"twice-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST twice")
    await _erase_before_the_rules(db_async, studio, gone, gone_booking)

    first = await erasure_backfill.backfill_erased_copies(db_async)
    second = await erasure_backfill.backfill_erased_copies(db_async)

    assert first.contacts == 1
    assert second.as_dict() == erasure_backfill.BackfillResult().as_dict()
    assert await _copy_count(db_async) == 0


async def test_a_crashed_batch_leaves_no_half_done_work_and_a_rerun_finishes(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    first_email = f"first-bf-{uuid.uuid4().hex[:8]}@example.com"
    second_email = f"second-bf-{uuid.uuid4().hex[:8]}@example.com"
    first_booking = await _book_next(
        db_async, async_client, studio, first_email, "TEST first"
    )
    second_booking = await _book_next(
        db_async, async_client, studio, second_email, "TEST second"
    )
    await _erase_before_the_rules(db_async, studio, first_email, first_booking)
    await _erase_before_the_rules(db_async, studio, second_email, second_booking)
    assert await _copy_count(db_async) == 2

    real_erase_all = references.erase_all
    calls = {"count": 0}

    async def crash_on_second(session: AsyncSession, *, contact_id: str) -> None:
        calls["count"] += 1
        if calls["count"] == 2:
            raise RuntimeError("simulated crash mid-run")
        await real_erase_all(session, contact_id=contact_id)

    monkeypatch.setattr(references, "erase_all", crash_on_second)
    with pytest.raises(RuntimeError):
        await erasure_backfill.backfill_erased_copies(db_async, batch_size=1)
    await db_async.rollback()
    # One batch committed, the crashed one did not: exactly one contact still holds copies.
    assert await _copy_count(db_async) == 1

    monkeypatch.setattr(references, "erase_all", real_erase_all)
    rerun = await erasure_backfill.backfill_erased_copies(db_async, batch_size=1)

    assert rerun.contacts == 1
    assert await _copy_count(db_async) == 0


async def test_a_batch_whose_hooks_leave_a_copy_is_rolled_back(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"refuse-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST refuse")
    await _erase_before_the_rules(db_async, studio, gone, gone_booking)

    async def hook_that_does_nothing(_session: AsyncSession, **_kwargs: str) -> None:
        return None

    monkeypatch.setattr(references, "erase_all", hook_that_does_nothing)
    with pytest.raises(ErasureBackfillError):
        await erasure_backfill.backfill_erased_copies(db_async)
    db_async.expire_all()
    assert await _copy_count(db_async) == 1


async def test_erased_contacts_mail_is_purged_and_another_business_is_not(
    db_async: AsyncSession,
) -> None:
    org_a = await _org(db_async)
    org_b = await _org(db_async)
    email = f"mail-bf-{_token()}@example.com"
    phone = _phone()
    erased = await _contact(db_async, org_a, email, "Gone", phone)
    await contacts_service.erase_contact(db_async, erased)
    await db_async.commit()

    # Mail written for this person before the mail purge existed.
    queued_a = await _queue_outbox(
        db_async,
        org_a,
        email,
        status=OutboxStatus.PENDING.value,
        name="Gone",
        phone=phone,
    )
    logged_a = await _queue_delivery(db_async, org_a, email, name="Gone")
    sent_a = _sent_row(org_a, email, name="Gone", phone=phone)
    db_async.add(sent_a)
    # The same address at a business that has an organisation contact of its own.
    queued_b = await _queue_outbox(
        db_async,
        org_b,
        email,
        status=OutboxStatus.PENDING.value,
        name="Gone",
        phone=phone,
    )
    sent_b = _sent_row(org_b, email, name="Gone", phone=phone)
    db_async.add(sent_b)
    await _contact(db_async, org_b, email, "Gone", phone)
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async)

    assert await db_async.get(Outbox, queued_a) is None
    assert await db_async.get(OutboundEmail, logged_a) is None
    redacted = await db_async.get(OutboundEmail, sent_a.id)
    assert redacted is not None and redacted.to_email != email
    assert await db_async.get(Outbox, queued_b) is not None
    kept = await db_async.get(OutboundEmail, sent_b.id)
    assert kept is not None and kept.to_email == email
    assert result.mail_addresses == 1
    assert result.mail_rows >= 3

    again = await erasure_backfill.backfill_erased_copies(db_async)
    assert again.mail_rows == 0
    assert again.mail_addresses == 0


async def test_the_contact_pass_is_bounded_by_batch_size(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    for name in ("one", "two"):
        email = f"bound-{name}-{uuid.uuid4().hex[:8]}@example.com"
        booking = await _book_next(
            db_async, async_client, studio, email, f"TEST {name}"
        )
        await _erase_before_the_rules(db_async, studio, email, booking)

    result = await erasure_backfill.backfill_erased_copies(db_async, batch_size=1)

    assert result.contacts == 2
    assert await _copy_count(db_async) == 0


def test_the_result_names_every_table_it_reports() -> None:
    assert set(erasure_backfill.BackfillResult().as_dict()) == {
        "contacts",
        "booking_rows",
        "booking_event_rows",
        "order_rows",
        "mail_addresses",
        "mail_rows",
        "contacts_remaining",
    }


async def test_an_erased_contact_with_no_mail_matches_nothing(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    contact = await _contact(
        db_async, org, f"none-{_token()}@example.com", "N", _phone()
    )
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async)

    assert result.mail_addresses == 0
    assert result.mail_rows == 0
    assert result.contacts_remaining == 0


async def test_mail_is_walked_page_by_page_past_addresses_that_match_nothing(
    db_async: AsyncSession,
) -> None:
    """With one pair per page the cursor must step over addresses that match no erased
    contact and still reach the erased one, whichever sorts first."""
    org = await _org(db_async)
    token = _token()
    erased_email = f"m-b-{token}@example.com"
    phone = _phone()
    erased = await _contact(db_async, org, erased_email, "Gone", phone)
    await contacts_service.erase_contact(db_async, erased)
    await db_async.commit()
    bystanders = [f"a-{token}@example.com", f"z-{token}@example.com"]
    for address in bystanders:
        db_async.add(_sent_row(org, address, name="Bystander", phone=phone))
    sent = _sent_row(org, erased_email, name="Gone", phone=phone)
    db_async.add(sent)
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async, mail_batch_size=1)

    redacted = await db_async.get(OutboundEmail, sent.id)
    assert redacted is not None and redacted.to_email != erased_email
    rows = (
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email.in_(bystanders))
        )
    ).all()
    assert sorted(row.to_email for row in rows) == sorted(bystanders)
    assert result.mail_addresses == 1


#: Every table whose rows carry an erase hook. A new hook must add its table here AND
#: extend ``_holds_copy`` in erasure_backfill.py, or the backfill cannot reach its copies
#: and its post-batch check passes vacuously.
EXPECTED_ERASE_HOOK_TABLES = {"bookings.customer", "events.orders"}


def test_every_erase_hook_table_is_known_to_the_backfill() -> None:
    assert {table.fullname for table in references.erasing()} == (
        EXPECTED_ERASE_HOOK_TABLES
    )


async def test_a_mail_pass_that_matches_nothing_is_reported(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    records: list[logging.LogRecord],
) -> None:
    """A rotated pepper matches no address. The run must say so, not report success."""
    org = await _org(db_async)
    email = f"pepper-bf-{_token()}@example.com"
    erased = await _contact(db_async, org, email, "Gone", _phone())
    await contacts_service.erase_contact(db_async, erased)
    await db_async.commit()
    db_async.add(_sent_row(org, email, name="Gone", phone=_phone()))
    await db_async.commit()
    monkeypatch.setattr(erasure_backfill, "hash_email", lambda _address: "0" * 64)

    result = await erasure_backfill.backfill_erased_copies(db_async)

    assert result.mail_addresses == 0
    assert "matched no mail for erased contacts" in _messages(records)


async def test_a_contact_locked_by_another_session_is_left_and_reported(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    records: list[logging.LogRecord],
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"locked-bf-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST locked")
    await _erase_before_the_rules(db_async, studio, gone, gone_booking)
    contact = await _contact_for(db_async, studio.org_id, gone)

    async with async_session_factory() as holder:
        await holder.execute(
            select(Contact.id).where(Contact.id == contact.id).with_for_update()
        )
        result = await erasure_backfill.backfill_erased_copies(db_async)
        await holder.rollback()

    assert result.contacts == 0
    assert result.contacts_remaining == 1
    assert "left contacts with copies" in _messages(records)
    rerun = await erasure_backfill.backfill_erased_copies(db_async)
    assert rerun.contacts == 1
    assert rerun.contacts_remaining == 0
