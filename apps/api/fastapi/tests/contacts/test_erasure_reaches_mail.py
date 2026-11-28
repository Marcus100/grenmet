"""Erasing a contact reaches the mail one business queued to or sent to that person
(#1963 part 1).

Queued mail (pending outbox rows and unsent delivery-log rows) is deleted: it must
not go to someone who asked to be forgotten. A sent row stays as the delivery record
(status, attempts, timestamps) and loses every personal field.

Scope: erasure is one business erasing its own contact. Mail is matched on the
address AND the erasing organisation, so another business's mail to the same person
is never touched, and rows with no organisation (written before the column) are left
to retention. All assertions read the database, not a response.
"""

import json
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import service
from src.contacts.models import Contact
from src.notifications import address_log, outbox_handlers
from src.notifications import service as notification_service
from src.notifications.models import OutboundEmail, OutboundEmailStatus
from src.organisations.models import MembershipRole
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import make_org


def _token() -> str:
    return uuid.uuid4().hex[:10]


def _phone() -> str:
    return f"+1473{uuid.uuid4().int % 10_000_000:07d}"


async def _org(db: AsyncSession) -> str:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Shop {_token()}",
        members=((owner, MembershipRole.OWNER),),
        apps=("contacts",),
    )
    return org.id


async def _contact(
    db: AsyncSession, org_id: str, email: str, name: str, phone: str
) -> Contact:
    return await service.upsert_contact(
        db, org_id, email=email, name=name, phone=phone, source="bookings"
    )


async def _queue_outbox(
    db: AsyncSession,
    org_id: str | None,
    to_email: str,
    *,
    status: str,
    name: str,
    phone: str,
) -> uuid.UUID:
    """An ``email.send`` row (the whole message is in the payload)."""
    dedupe = f"test-{_token()}"
    await outbox_handlers.enqueue_email(
        db,
        to_email=to_email,
        subject=f"Hello {name}",
        dedupe_key=dedupe,
        transactional=False,
        template="card",
        props={"firstName": name, "phone": phone},
        organisation_id=org_id,
    )
    row = await db.scalar(select(Outbox).where(Outbox.dedupe_key == dedupe))
    assert row is not None
    row.status = status
    await db.flush()
    return row.id


async def _queue_delivery(
    db: AsyncSession, org_id: str | None, to_email: str, *, name: str
) -> uuid.UUID:
    """An ``OutboundEmail`` row plus its ``email.deliver`` outbox row (pending)."""
    row = notification_service.enqueue_email(
        session=db,
        to_email=to_email,
        subject=f"Hello {name}",
        transactional=False,
        template="card",
        props={"firstName": name},
        organisation_id=org_id,
    )
    await db.flush()
    return row.id


def _sent_row(
    org_id: str | None, to_email: str, *, name: str, phone: str
) -> OutboundEmail:
    return OutboundEmail(
        id=uuid.uuid4(),
        to_email=to_email,
        subject=f"Hello {name} again",
        template="card",
        props={"firstName": name, "phone": phone},
        html=f"<p>{name} {phone}</p>",
        transactional=False,
        status=OutboundEmailStatus.SENT.value,
        attempts=1,
        sent_at=utc_now(),
        created_at=utc_now(),
        organisation_id=org_id,
    )


def _log_text(row: OutboundEmail) -> str:
    return " ".join(
        [
            row.to_email,
            row.subject,
            row.html or "",
            row.dedupe_key or "",
            row.last_error or "",
            json.dumps(row.props),
        ]
    )


def _queue_text(row: Outbox) -> str:
    return json.dumps(row.payload) + " " + row.dedupe_key


def _snapshot(row: Outbox | OutboundEmail) -> dict[str, object]:
    if isinstance(row, Outbox):
        return {
            "status": row.status,
            "payload": dict(row.payload),
            "dedupe_key": row.dedupe_key,
        }
    return {
        "to_email": row.to_email,
        "subject": row.subject,
        "props": dict(row.props),
        "html": row.html,
        "status": row.status,
        "organisation_id": row.organisation_id,
    }


async def test_erasure_deletes_queued_mail_and_redacts_sent_rows(
    db_async: AsyncSession,
) -> None:
    org_id = await _org(db_async)
    token = _token()
    name = f"Zanna{token}"
    phone = _phone()
    email = f"gone-{token}@example.com"
    contact = await _contact(db_async, org_id, email, name, phone)
    contact_id = contact.id

    # Pending email.send row, written with an upper-case address and spaces: the same
    # normalised address, so it must match.
    pending_send = await _queue_outbox(
        db_async,
        org_id,
        f"  {email.upper()} ",
        status=OutboxStatus.PENDING.value,
        name=name,
        phone=phone,
    )
    dead_send = await _queue_outbox(
        db_async, org_id, email, status=OutboxStatus.DEAD.value, name=name, phone=phone
    )
    pending_log = await _queue_delivery(db_async, org_id, email, name=name)
    sent_log = _sent_row(org_id, email, name=name, phone=phone)
    sent_id = sent_log.id
    db_async.add(sent_log)
    failed_id = uuid.uuid4()
    db_async.add(
        OutboundEmail(
            id=failed_id,
            to_email=email,
            subject=f"Hello {name} failed",
            template="card",
            props={"firstName": name},
            transactional=False,
            status=OutboundEmailStatus.FAILED.value,
            attempts=5,
            last_error="Delivery failed: TimeoutError",
            created_at=utc_now(),
            organisation_id=org_id,
        )
    )
    # Written before the column existed: no organisation, so not attributable.
    unattributed = _sent_row(None, email, name=name, phone=phone)
    unattributed_id = unattributed.id
    db_async.add(unattributed)
    await db_async.commit()
    unattributed_before = _snapshot(await db_async.get(OutboundEmail, unattributed_id))

    contact = await db_async.get(Contact, contact_id)
    assert contact is not None
    await service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    # Queued mail is gone: the pending outbox row, and the unsent log row together
    # with its email.deliver outbox row.
    assert await db_async.get(Outbox, pending_send) is None
    assert await db_async.get(OutboundEmail, pending_log) is None
    deliver_left = await db_async.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.topic == notification_service.EMAIL_DELIVER,
            Outbox.payload["outbound_email_id"].astext == str(pending_log),
        )
    )
    assert deliver_left == 0

    # A dead row keeps its record (status) and loses the message.
    dead = await db_async.get(Outbox, dead_send)
    assert dead is not None
    assert dead.status == OutboxStatus.DEAD.value
    assert dead.payload == {}
    assert dead.dedupe_key == f"erased:{dead_send}"

    # The sent row survives as the delivery record, with no personal fields.
    sent = await db_async.get(OutboundEmail, sent_id)
    assert sent is not None
    assert sent.status == OutboundEmailStatus.SENT.value
    assert sent.sent_at is not None
    assert sent.attempts == 1
    assert sent.props == {"erased": "contact"}
    assert sent.html is None
    assert sent.to_email != email
    assert name not in sent.subject
    assert email not in _log_text(sent)
    assert name not in _log_text(sent)
    assert phone not in _log_text(sent)

    # The final failure keeps its record and loses the address and first name.
    failed = await db_async.get(OutboundEmail, failed_id)
    assert failed is not None
    assert failed.status == OutboundEmailStatus.FAILED.value
    assert failed.attempts == 5
    assert failed.props == {"erased": "contact"}
    assert failed.to_email != email

    # The row with no organisation is left to the retention purge, unchanged.
    unattributed_after = await db_async.get(OutboundEmail, unattributed_id)
    assert unattributed_after is not None
    assert _snapshot(unattributed_after) == unattributed_before


async def test_same_address_at_another_business_is_untouched(
    db_async: AsyncSession,
) -> None:
    """The case that matters most: one person is a contact of two businesses. Erasing
    the contact at one must not delete or redact the other business's queued mail,
    sent rows or contact."""
    org_a = await _org(db_async)
    org_b = await _org(db_async)
    token = _token()
    email = f"shared-{token}@example.com"
    name_a = f"Alice{token}"
    name_b = f"Alicia{token}"
    phone_a = _phone()
    phone_b = _phone()
    contact_a = await _contact(db_async, org_a, email, name_a, phone_a)
    contact_a_id = contact_a.id
    contact_b = await _contact(db_async, org_b, email, name_b, phone_b)
    contact_b_id = contact_b.id

    # Business A: queued and sent mail to the address.
    a_pending = await _queue_outbox(
        db_async,
        org_a,
        email,
        status=OutboxStatus.PENDING.value,
        name=name_a,
        phone=phone_a,
    )
    a_delivery = await _queue_delivery(db_async, org_a, email, name=name_a)
    # Business B: the same address, pending and sent.
    b_pending = await _queue_outbox(
        db_async,
        org_b,
        email,
        status=OutboxStatus.PENDING.value,
        name=name_b,
        phone=phone_b,
    )
    b_delivery = await _queue_delivery(db_async, org_b, email, name=name_b)
    b_sent = _sent_row(org_b, email, name=name_b, phone=phone_b)
    b_sent_id = b_sent.id
    db_async.add(b_sent)
    await db_async.commit()

    b_queue_before = _snapshot(await db_async.get(Outbox, b_pending))
    b_delivery_queue_id = await db_async.scalar(
        select(Outbox.id).where(
            Outbox.topic == notification_service.EMAIL_DELIVER,
            Outbox.payload["outbound_email_id"].astext == str(b_delivery),
        )
    )
    assert b_delivery_queue_id is not None
    b_delivery_queue_before = _snapshot(await db_async.get(Outbox, b_delivery_queue_id))
    b_delivery_before = _snapshot(await db_async.get(OutboundEmail, b_delivery))
    b_sent_before = _snapshot(await db_async.get(OutboundEmail, b_sent_id))

    contact_a = await db_async.get(Contact, contact_a_id)
    assert contact_a is not None
    await service.erase_contact(db_async, contact_a)
    await db_async.commit()
    db_async.expire_all()

    # Business A's queued mail is gone.
    assert await db_async.get(Outbox, a_pending) is None
    assert await db_async.get(OutboundEmail, a_delivery) is None

    # Business B's queued mail, its delivery-log row and its sent row are untouched.
    assert _snapshot(await db_async.get(Outbox, b_pending)) == b_queue_before
    assert (
        _snapshot(await db_async.get(Outbox, b_delivery_queue_id))
        == b_delivery_queue_before
    )
    assert _snapshot(await db_async.get(OutboundEmail, b_delivery)) == b_delivery_before
    assert _snapshot(await db_async.get(OutboundEmail, b_sent_id)) == b_sent_before
    b_sent_row = await db_async.get(OutboundEmail, b_sent_id)
    assert b_sent_row is not None
    assert name_b in _log_text(b_sent_row)

    # Business B's contact is still whole.
    contact_b = await db_async.get(Contact, contact_b_id)
    assert contact_b is not None
    assert contact_b.erased_at is None
    assert contact_b.email == email
    assert contact_b.name == name_b


async def test_another_persons_mail_is_untouched(db_async: AsyncSession) -> None:
    org_id = await _org(db_async)
    token = _token()
    gone_name = f"Gone{token}"
    gone_email = f"gone-{token}@example.com"
    gone = await _contact(db_async, org_id, gone_email, gone_name, _phone())
    gone_id = gone.id

    kept_name = f"Kept{token}"
    kept_phone = _phone()
    kept_email = f"kept-{token}@example.com"
    await _contact(db_async, org_id, kept_email, kept_name, kept_phone)

    kept_pending = await _queue_outbox(
        db_async,
        org_id,
        kept_email,
        status=OutboxStatus.PENDING.value,
        name=kept_name,
        phone=kept_phone,
    )
    kept_delivery = await _queue_delivery(db_async, org_id, kept_email, name=kept_name)
    kept_sent = _sent_row(org_id, kept_email, name=kept_name, phone=kept_phone)
    kept_sent_id = kept_sent.id
    db_async.add(kept_sent)
    gone_pending = await _queue_outbox(
        db_async,
        org_id,
        gone_email,
        status=OutboxStatus.PENDING.value,
        name=gone_name,
        phone=_phone(),
    )
    await db_async.commit()

    before = {
        "pending": _snapshot(await db_async.get(Outbox, kept_pending)),
        "delivery": _snapshot(await db_async.get(OutboundEmail, kept_delivery)),
        "sent": _snapshot(await db_async.get(OutboundEmail, kept_sent_id)),
    }

    gone = await service.get_contact(db_async, org_id, gone_id)
    await service.erase_contact(db_async, gone)
    await db_async.commit()
    db_async.expire_all()

    assert await db_async.get(Outbox, gone_pending) is None
    after = {
        "pending": _snapshot(await db_async.get(Outbox, kept_pending)),
        "delivery": _snapshot(await db_async.get(OutboundEmail, kept_delivery)),
        "sent": _snapshot(await db_async.get(OutboundEmail, kept_sent_id)),
    }
    assert after == before


async def test_erasing_twice_is_harmless(db_async: AsyncSession) -> None:
    org_id = await _org(db_async)
    token = _token()
    name = f"Twice{token}"
    email = f"twice-{token}@example.com"
    contact = await _contact(db_async, org_id, email, name, _phone())
    contact_id = contact.id
    await _queue_outbox(
        db_async,
        org_id,
        email,
        status=OutboxStatus.PENDING.value,
        name=name,
        phone=_phone(),
    )
    await db_async.commit()

    for _ in range(2):
        contact = await db_async.get(Contact, contact_id)
        assert contact is not None
        await service.erase_contact(db_async, contact)
        await db_async.commit()

    # The mail step itself is repeatable: nothing is left to change the second time.
    assert (
        await address_log.clear_contact_mail(db_async, organisation_id=org_id, email=email)
        == 0
    )
    remaining = await db_async.scalar(
        select(func.count()).select_from(Outbox).where(Outbox.organisation_id == org_id)
    )
    assert remaining == 0


def test_the_handler_stamps_the_business_on_the_delivery_log_row() -> None:
    """The outbox row's organisation becomes the delivery log's, so erasure can scope
    to it later."""
    message = OutboxMessage(
        id=uuid.uuid4(),
        organisation_id="org-test-1",
        topic=outbox_handlers.EMAIL_SEND,
        payload={"to_email": "A@Example.com ", "subject": "Hi", "props": {}},
        dedupe_key="k",
        attempts=0,
    )
    row = outbox_handlers._log_row(message)
    assert row.organisation_id == "org-test-1"
    assert row.to_email == "a@example.com"


def test_a_message_without_an_organisation_logs_none() -> None:
    message = OutboxMessage(
        id=uuid.uuid4(),
        organisation_id=None,
        topic=outbox_handlers.EMAIL_SEND,
        payload={"to_email": "b@example.com", "subject": "Hi"},
        dedupe_key="k2",
        attempts=0,
    )
    assert outbox_handlers._log_row(message).organisation_id is None
