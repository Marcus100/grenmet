"""Account deletion clears the person's address from the email delivery log (issue #1629).

The delivery log (``outbound_email``) and the platform outbox (``email.send``
payloads) keep the address and the props of every mail queued to the person. A
deleted account must leave no address, first name or signed link behind, while the
delivery statistics (status, attempts, timestamps) and bounce suppression stay.
"""

import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import String

from src import outbox
from src.audit.models import AuditEntry
from src.auth import service
from src.auth.models import User
from src.database import async_session_factory
from src.email_config import email_settings
from src.notifications import address_log, dispatch, outbox_handlers
from src.notifications import service as notification_service
from src.notifications.models import (
    EmailSuppression,
    Notification,
    OutboundEmail,
    OutboundEmailStatus,
    SuppressionReason,
)
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now
from tests.factories import make_user


@pytest.fixture
def mail_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Let the real send path run; the shared stub records the provider call."""
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)


def _names() -> tuple[str, str]:
    """A local part and a first name no other test uses."""
    token = uuid.uuid4().hex[:12]
    return f"person-{token}", f"Zanna{token}"


async def _address_rows(db: AsyncSession, address: str) -> list[OutboundEmail]:
    rows = await db.scalars(
        select(OutboundEmail).where(OutboundEmail.to_email == address)
    )
    return list(rows.all())


async def _leaks(db: AsyncSession, needle: str) -> int:
    """Rows in the covered tables that still hold ``needle`` in any text column."""
    log = await db.scalar(
        select(func.count())
        .select_from(OutboundEmail)
        .where(
            OutboundEmail.to_email.contains(needle)
            | OutboundEmail.subject.contains(needle)
            | OutboundEmail.last_error.contains(needle)
            | OutboundEmail.html.contains(needle)
            | cast(OutboundEmail.props, String).contains(needle)
        )
    )
    queue = await db.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            cast(Outbox.payload, String).contains(needle)
            | Outbox.dedupe_key.contains(needle)
        )
    )
    audit = await db.scalar(
        select(func.count())
        .select_from(AuditEntry)
        .where(cast(AuditEntry.changes, String).contains(needle))
    )
    notices = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.title.contains(needle) | Notification.body.contains(needle))
    )
    return int(log or 0) + int(queue or 0) + int(audit or 0) + int(notices or 0)


async def _queue_person_mail(
    db: AsyncSession, address: str, first_name: str
) -> dict[str, uuid.UUID]:
    """Mail in every state the log can hold for one person. Returns the row ids."""
    link = f"https://example.com/unsubscribe?token=tok-{first_name}"
    props = {"firstName": first_name, "unsubscribeLink": link}
    queued = notification_service.enqueue_email(
        session=db,
        to_email=address,
        subject=f"Hello {first_name}",
        transactional=False,
        template="card",
        props=props,
    )
    sent = OutboundEmail(
        id=uuid.uuid4(),
        to_email=address,
        subject=f"Hello {first_name} again",
        template="card",
        props={"firstName": first_name},
        transactional=False,
        status=OutboundEmailStatus.SENT.value,
        attempts=1,
        sent_at=utc_now(),
        created_at=utc_now(),
    )
    skipped = OutboundEmail(
        id=uuid.uuid4(),
        to_email=address,
        subject="Skipped",
        template="card",
        props=dict(props),
        transactional=False,
        status=OutboundEmailStatus.SKIPPED.value,
        last_error="Address is on the suppression list",
        attempts=1,
        created_at=utc_now(),
    )
    retrying = OutboundEmail(
        id=uuid.uuid4(),
        to_email=address,
        subject="Retrying",
        template="card",
        props=dict(props),
        transactional=False,
        status=OutboundEmailStatus.FAILED.value,
        last_error=f"provider rejected {address}",
        attempts=1,
        next_retry_at=utc_now() + timedelta(hours=1),
        created_at=utc_now(),
    )
    db.add_all([sent, skipped, retrying])
    await db.flush()
    # A pending mail on the platform outbox, and a dead one, both carry the payload.
    await outbox_handlers.enqueue_email(
        db,
        to_email=address,
        subject=f"Outbox {first_name}",
        dedupe_key=f"test-{uuid.uuid4().hex}",
        transactional=False,
        html=f"<p>Hi {first_name}</p>",
        props={"firstName": first_name, "unsubscribeLink": link},
    )
    db.add(
        Outbox(
            id=uuid.uuid4(),
            topic=outbox_handlers.EMAIL_SEND,
            payload={
                "to_email": address,
                "subject": f"Dead {first_name}",
                "transactional": False,
                "html": None,
                "template": "card",
                "props": {"firstName": first_name},
            },
            dedupe_key=f"dead-{uuid.uuid4().hex}",
            attempts=5,
            next_attempt_at=utc_now(),
            status=OutboxStatus.DEAD.value,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    await db.commit()
    return {
        "queued": queued.id,
        "sent": sent.id,
        "skipped": skipped.id,
        "retrying": retrying.id,
    }


@pytest.mark.usefixtures("db_async")
async def test_deletion_clears_the_address_and_content_from_the_delivery_log(
    db_async: AsyncSession,
) -> None:
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await db_async.commit()
    ids = await _queue_person_mail(db_async, address, first_name)
    sent_before = await db_async.get(OutboundEmail, ids["sent"])
    assert sent_before is not None
    sent_at = sent_before.sent_at

    await service.delete_user(session=db_async, user=user)

    assert await _leaks(db_async, address) == 0
    assert await _leaks(db_async, first_name) == 0
    assert await _leaks(db_async, "unsubscribe?token=tok-" + first_name) == 0
    rows = {
        key: await db_async.get(OutboundEmail, row_id) for key, row_id in ids.items()
    }
    for row in rows.values():
        assert row is not None
        assert row.to_email.startswith("deleted-")
        assert row.to_email.endswith("@example.com")
        assert row.props == {}
        assert row.html is None
        assert row.subject == address_log.DELETED_SUBJECT
        assert row.next_retry_at is None
    # Statistics survive: sent stays sent with its time, a retry no longer runs.
    assert rows["sent"].status == OutboundEmailStatus.SENT.value
    assert rows["sent"].sent_at == sent_at
    assert rows["sent"].attempts == 1
    assert rows["skipped"].status == OutboundEmailStatus.SKIPPED.value
    assert rows["retrying"].status == OutboundEmailStatus.SKIPPED.value
    assert rows["retrying"].attempts == 1
    # The queued mail is never sent to the placeholder.
    assert rows["queued"].status == OutboundEmailStatus.SKIPPED.value


@pytest.mark.usefixtures("mail_configured")
async def test_a_queued_mail_is_never_sent_after_deletion(
    db_async: AsyncSession, outbound_email_calls: list[dict[str, str]]
) -> None:
    """Deletion leaves nothing for the outbox drain to send. The real drain runs both
    email topics after the deletion, with every queued mail due, and the provider is
    never called for the deleted person's address or its placeholder."""
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await db_async.commit()
    ids = await _queue_person_mail(db_async, address, first_name)

    await service.delete_user(session=db_async, user=user)
    await outbox.drain(
        db_async,
        only_topics={outbox_handlers.EMAIL_SEND, notification_service.EMAIL_DELIVER},
        now=utc_now() + timedelta(days=1),
    )

    assert outbound_email_calls == []
    queued = await db_async.get(OutboundEmail, ids["queued"], populate_existing=True)
    assert queued is not None
    assert queued.status == OutboundEmailStatus.SKIPPED.value
    assert queued.sent_at is None
    retrying = await db_async.get(
        OutboundEmail, ids["retrying"], populate_existing=True
    )
    assert retrying is not None
    assert retrying.status == OutboundEmailStatus.SKIPPED.value
    pending = await db_async.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.status == OutboxStatus.PENDING.value,
            Outbox.topic.in_(
                [outbox_handlers.EMAIL_SEND, notification_service.EMAIL_DELIVER]
            ),
        )
    )
    assert pending == 0


@pytest.mark.usefixtures("db_async")
async def test_other_people_and_look_alike_addresses_are_untouched(
    db_async: AsyncSession,
) -> None:
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await db_async.commit()
    await _queue_person_mail(db_async, address, first_name)

    other_name = f"Other{uuid.uuid4().hex[:10]}"
    look_alikes = [
        f"{local}@example.org",
        f"{local}+news@example.com",
        f"x{local}@example.com",
    ]
    other_address = f"someone-{uuid.uuid4().hex[:8]}@example.com"
    for other in [*look_alikes, other_address]:
        notification_service.enqueue_email(
            session=db_async,
            to_email=other,
            subject=f"Hi {other_name}",
            transactional=False,
            template="card",
            props={"firstName": other_name},
        )
    await db_async.commit()
    before = {
        row.id: (row.to_email, row.subject, dict(row.props))
        for other in [*look_alikes, other_address]
        for row in await _address_rows(db_async, other)
    }
    assert len(before) == 4

    await service.delete_user(session=db_async, user=user)

    after = {
        row.id: (row.to_email, row.subject, dict(row.props))
        for other in [*look_alikes, other_address]
        for row in await _address_rows(db_async, other)
    }
    assert after == before
    # The person's own address is gone by exact match. (A substring check would
    # also hit "x<local>@example.com", which must stay untouched.)
    assert await _address_rows(db_async, address) == []
    assert await _leaks(db_async, first_name) == 0


@pytest.mark.usefixtures("db_async")
async def test_bounce_suppression_still_blocks_the_address(
    db_async: AsyncSession,
) -> None:
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await notification_service.suppress_email(
        session=db_async,
        email=address,
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id="evt-deletion-test",
    )
    await db_async.commit()
    await _queue_person_mail(db_async, address, first_name)

    await service.delete_user(session=db_async, user=user)

    assert await notification_service.is_suppressed(session=db_async, email=address)
    stored = await db_async.scalar(
        select(EmailSuppression.email_hash).where(
            EmailSuppression.email_hash.is_not(None)
        )
    )
    assert stored is not None
    assert address not in stored


@pytest.mark.usefixtures("db_async")
async def test_a_second_deletion_changes_nothing_in_the_log(
    db_async: AsyncSession,
) -> None:
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await db_async.commit()
    user_id = user.id
    await _queue_person_mail(db_async, address, first_name)
    await service.delete_user(session=db_async, user=user)

    def snapshot(rows: list[OutboundEmail]) -> list[tuple[object, ...]]:
        return sorted(
            (r.id, r.to_email, r.subject, r.status, r.attempts, r.props, r.html)
            for r in rows
        )

    placeholder_rows = await db_async.scalars(
        select(OutboundEmail).where(OutboundEmail.to_email.like("deleted-%"))
    )
    before = snapshot(list(placeholder_rows.all()))
    assert before

    again = await db_async.get(User, user_id)
    assert again is not None
    await service.delete_user(session=db_async, user=again)

    placeholder_rows = await db_async.scalars(
        select(OutboundEmail).where(OutboundEmail.to_email.like("deleted-%"))
    )
    assert snapshot(list(placeholder_rows.all())) == before
    audits = await db_async.scalars(
        select(AuditEntry).where(
            AuditEntry.entity_type == "account",
            AuditEntry.entity_id == str(user_id),
            AuditEntry.record_type == "account_deletion",
        )
    )
    assert len(list(audits.all())) == 1


@pytest.mark.usefixtures("db_async", "mail_configured")
@pytest.mark.parametrize("outcome", ["sent", "dead"])
async def test_a_send_in_flight_during_deletion_leaves_no_address(
    db_async: AsyncSession, outcome: str
) -> None:
    """The outbox drain holds an email.send row while its handler writes the log row
    with the real address (sent, or failed when dead). Deletion must wait for that
    commit, so the address never survives. Each step runs the real handler code."""
    local, first_name = _names()
    address = f"{local}@example.com"
    key = f"inflight-{uuid.uuid4().hex}"
    user = await make_user(db_async, email=address)
    await outbox_handlers.enqueue_email(
        db_async,
        to_email=address,
        subject=f"Hi {first_name}",
        dedupe_key=key,
        transactional=False,
        html=f"<p>Hi {first_name}</p>",
        props={
            "firstName": first_name,
            "unsubscribeLink": f"https://example.com/u?token=tok-{first_name}",
        },
    )
    await db_async.commit()
    user_id = user.id

    async with async_session_factory() as drain, async_session_factory() as deletion:
        row = await drain.scalar(
            select(Outbox).where(Outbox.dedupe_key == key).with_for_update()
        )
        assert row is not None
        message = outbox.OutboxMessage(
            id=row.id,
            organisation_id=row.organisation_id,
            topic=row.topic,
            payload=dict(row.payload),
            dedupe_key=row.dedupe_key,
            attempts=row.attempts,
        )
        # Deletion starts while the drain holds the row, and must wait for it.
        deleted_user = await deletion.get(User, user_id)
        assert deleted_user is not None
        task = asyncio.create_task(
            service.delete_user(session=deletion, user=deleted_user)
        )
        await asyncio.sleep(1)
        assert not task.done(), "deletion must wait for the in-flight send"

        if outcome == "sent":
            await outbox_handlers.send_email(drain, message)
            # What outbox.drain does after a successful handler, then its commit.
            row.status = OutboxStatus.DONE.value
            row.payload = {}
            await drain.commit()
        else:
            # The real failure path: a terminal failure goes dead at once, the dead
            # handler writes the failed log row, and the payload is kept as production
            # keeps it. _record_failure commits, which releases the lock.
            await outbox._record_failure(
                drain, message, outbox.TerminalFailure("provider down"), utc_now()
            )
        await task

    async with async_session_factory() as check:
        assert await _leaks(check, address) == 0
        assert await _leaks(check, first_name) == 0
        assert await _leaks(check, "unsubscribe?token=tok-" + first_name) == 0
        log = (
            await check.scalars(
                select(OutboundEmail).where(OutboundEmail.to_email.like("deleted-%"))
            )
        ).all()
        assert len(log) == 1
        expected = (
            OutboundEmailStatus.SENT
            if outcome == "sent"
            else OutboundEmailStatus.FAILED
        )
        assert log[0].status == expected.value
        assert log[0].props == {}
        assert log[0].html is None


@pytest.mark.usefixtures("db_async")
async def test_padded_and_capitalised_stored_addresses_are_matched(
    db_async: AsyncSession,
) -> None:
    """Python strips all whitespace from the address; the column match must strip the
    same characters (a stored tab or newline is not a space)."""
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    for value in (f"\t{address.upper()}\n", f" {address} \r\n"):
        db_async.add(
            OutboundEmail(
                id=uuid.uuid4(),
                to_email=value,
                subject=f"Hi {first_name}",
                template="card",
                props={"firstName": first_name},
                transactional=False,
                status=OutboundEmailStatus.SENT.value,
                attempts=1,
                created_at=utc_now(),
            )
        )
    db_async.add(
        Outbox(
            id=uuid.uuid4(),
            topic=outbox_handlers.EMAIL_SEND,
            payload={
                "to_email": f"\t{address}\n",
                "subject": f"Hi {first_name}",
                "transactional": False,
                "html": None,
                "template": "card",
                "props": {"firstName": first_name},
            },
            dedupe_key=f"padded-{uuid.uuid4().hex}",
            attempts=0,
            next_attempt_at=utc_now(),
            status=OutboxStatus.PENDING.value,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    await db_async.commit()

    await service.delete_user(session=db_async, user=user)

    assert await _leaks(db_async, first_name) == 0
    left_in_log = await db_async.scalar(
        select(func.count())
        .select_from(OutboundEmail)
        .where(OutboundEmail.to_email.ilike(f"%{local}%"))
    )
    assert left_in_log == 0
    left_in_queue = await db_async.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(cast(Outbox.payload, String).ilike(f"%{local}%"))
    )
    assert left_in_queue == 0


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (OutboxStatus.PENDING.value, OutboxStatus.DONE.value),
        (OutboxStatus.DEAD.value, OutboxStatus.DEAD.value),
        (OutboxStatus.DONE.value, OutboxStatus.DONE.value),
    ],
)
def test_erase_payload_moves_only_a_pending_row_to_done(
    status: str, expected: str
) -> None:
    row = Outbox(
        topic=outbox_handlers.EMAIL_SEND,
        payload={"to_email": "someone@example.com"},
        dedupe_key=uuid.uuid4().hex,
        status=status,
    )
    outbox.erase_payload(row, utc_now())
    assert row.status == expected
    assert row.payload == {}


@pytest.mark.parametrize(
    ("status", "next_retry_at", "moves"),
    [
        (OutboundEmailStatus.PENDING.value, None, True),
        (OutboundEmailStatus.FAILED.value, utc_now(), True),
        (OutboundEmailStatus.FAILED.value, None, False),
        (OutboundEmailStatus.SENT.value, None, False),
        (OutboundEmailStatus.SKIPPED.value, None, False),
    ],
)
def test_skip_unsent_only_moves_mail_that_is_not_final(
    status: str, next_retry_at: object, moves: bool
) -> None:
    row = OutboundEmail(
        to_email="someone@example.com",
        subject="Hello",
        status=status,
        next_retry_at=next_retry_at,
    )
    dispatch.skip_unsent(row, "Account deleted before sending")
    if moves:
        assert row.status == OutboundEmailStatus.SKIPPED.value
        assert row.last_error == "Account deleted before sending"
    else:
        assert row.status == status


@pytest.mark.usefixtures("db_async", "mail_configured")
async def test_dedupe_keys_that_carry_the_address_are_erased(
    db_async: AsyncSession,
) -> None:
    """Production writes the address into dedupe keys: the CAP failure mail
    (outbound_email) and the webhook disabled mail (outbox, email.send). Both are
    replaced, and the replacements stay unique."""
    local, first_name = _names()
    address = f"{local}@example.com"
    user = await make_user(db_async, email=address)
    await db_async.commit()
    cap_key = f"cap-job-failed:{uuid.uuid4().hex}:{address}"
    webhook_key = f"webhook-disabled:{uuid.uuid4().hex}:1700000000:{address}"
    queued = await notification_service.enqueue_email_once(
        session=db_async,
        to_email=address,
        subject=f"Job {first_name}",
        dedupe_key=cap_key,
        template="notification",
        props={"firstName": first_name},
    )
    assert queued is True
    await outbox_handlers.enqueue_email(
        db_async,
        to_email=address,
        subject=f"Webhook {first_name}",
        dedupe_key=webhook_key,
        transactional=True,
        html=f"<p>{first_name}</p>",
    )
    await db_async.commit()

    await service.delete_user(session=db_async, user=user)

    assert await _leaks(db_async, address) == 0
    keys = (
        await db_async.scalars(
            select(OutboundEmail.dedupe_key).where(
                OutboundEmail.dedupe_key.like("erased:%")
            )
        )
    ).all()
    queue_keys = (
        await db_async.scalars(
            select(Outbox.dedupe_key).where(Outbox.dedupe_key.like("erased:%"))
        )
    ).all()
    assert len(keys) == 1
    assert len(queue_keys) == 1
    assert address not in keys[0]
    assert address not in queue_keys[0]
    assert keys[0] != queue_keys[0]
