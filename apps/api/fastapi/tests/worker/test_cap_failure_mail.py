"""The CAP failure email never goes to an address with no account (issue 1629).

Recipients come from configuration. A recipient whose account was deleted (or
never existed) is skipped and logged without its address; the others still get
one email per failed job.
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent
from src.notifications.models import OutboundEmail
from src.worker import cap_failure_mail
from src.worker.config import worker_settings
from tests.factories import make_user


def _token() -> str:
    return uuid.uuid4().hex[:10]


async def _failed_job(db: AsyncSession) -> CapJobEvent:
    job = CapJobEvent(
        kind="publish.email",
        payload={},
        attempts=5,
        result={"error_class": "SMTPError"},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def _mails_to(db: AsyncSession, address: str) -> list[OutboundEmail]:
    rows = await db.scalars(
        select(OutboundEmail).where(OutboundEmail.to_email == address)
    )
    return list(rows.all())


@pytest.mark.usefixtures("db_async")
async def test_a_recipient_with_no_account_is_skipped_and_logged_without_address(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = _token()
    ghost = f"ghost-{token}@example.com"
    real = f"gms-{token}@example.com"
    await make_user(db_async, email=real)
    await db_async.commit()
    monkeypatch.setattr(
        worker_settings, "CAP_DELIVERY_FAILURE_RECIPIENTS", f"{ghost}, {real}"
    )
    job = await _failed_job(db_async)

    logged: list[str] = []
    monkeypatch.setattr(
        cap_failure_mail.logger,
        "warning",
        lambda msg, *args, **kwargs: logged.append(f"{msg} {args} {kwargs}"),
    )

    queued = await cap_failure_mail.queue_failure_emails(session=db_async, jobs=[job])
    await db_async.commit()

    assert queued == 1
    assert await _mails_to(db_async, ghost) == []
    assert len(await _mails_to(db_async, real)) == 1
    assert any("no account" in line for line in logged)
    assert all(ghost not in line for line in logged)


@pytest.mark.usefixtures("db_async")
async def test_an_address_with_an_account_is_matched_case_insensitively(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = _token()
    account = f"Gms-{token}@Example.com"
    await make_user(db_async, email=account.lower())
    await db_async.commit()
    monkeypatch.setattr(
        worker_settings, "CAP_DELIVERY_FAILURE_RECIPIENTS", account.upper()
    )
    job = await _failed_job(db_async)

    queued = await cap_failure_mail.queue_failure_emails(session=db_async, jobs=[job])
    await db_async.commit()

    assert queued == 1


@pytest.mark.usefixtures("db_async")
async def test_no_recipient_with_an_account_queues_nothing(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = _token()
    monkeypatch.setattr(
        worker_settings,
        "CAP_DELIVERY_FAILURE_RECIPIENTS",
        f"ghost-{token}@example.com",
    )
    job = await _failed_job(db_async)

    queued = await cap_failure_mail.queue_failure_emails(session=db_async, jobs=[job])

    assert queued == 0
