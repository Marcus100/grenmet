"""Races, proved with held transactions rather than luck.

Each test holds one transaction open with a row lock, starts a competing write on
a second session, then commits the first. The outcome is decided by the guard in
the statement (``WHERE admitted_at IS NULL``, ``WHERE status = 'valid'``, the
event row lock), so each test would fail if that guard were removed.
"""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory
from src.printix import service
from src.printix.exceptions import PrintixConflict
from src.printix.models import PrintixPairing, PrintixTicket
from src.printix.schemas import PrintixImportReport
from src.utils.datetime import utc_now

from .support import make_event, make_pairing, make_ticket

pytestmark = pytest.mark.usefixtures("db_async")


async def _pairing_row(db: AsyncSession, pairing: PrintixPairing) -> PrintixPairing:
    row = await db.get(PrintixPairing, pairing.id, populate_existing=True)
    assert row is not None
    return row


async def test_the_second_admission_is_refused_while_the_first_is_uncommitted(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PX-RACE")
    pairing, _ = await make_pairing(db_async, event, gate="North")
    pairing = await _pairing_row(db_async, pairing)
    now = utc_now()

    async with async_session_factory() as first, async_session_factory() as second:
        won_first = await service._stamp_if_unadmitted(first, ticket.id, pairing, now)
        # The first transaction holds the row; the second must wait for it.
        contender = asyncio.create_task(
            service._stamp_if_unadmitted(second, ticket.id, pairing, now)
        )
        await asyncio.sleep(0.3)
        assert not contender.done(), "the second UPDATE should wait on the row lock"
        await first.commit()
        won_second = await contender

    assert won_first is True
    assert won_second is False


async def test_a_void_racing_an_admission_loses_cleanly(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "002", barcode="PX-VOID-RACE")
    pairing, _ = await make_pairing(db_async, event, gate="South")
    pairing = await _pairing_row(db_async, pairing)
    now = utc_now()

    async with async_session_factory() as admitting, async_session_factory() as voiding:
        assert await service._stamp_if_unadmitted(admitting, ticket.id, pairing, now)
        void_attempt = asyncio.create_task(
            service.set_ticket_void(voiding, ticket.id, void=True)
        )
        await asyncio.sleep(0.3)
        assert not void_attempt.done(), "the void should wait on the admission"
        await admitting.commit()
        with pytest.raises(PrintixConflict) as refused:
            await void_attempt

    assert refused.value.status_code == 409
    stored = await db_async.get(PrintixTicket, ticket.id, populate_existing=True)
    assert stored is not None
    assert stored.status == "valid"
    assert stored.admitted_at is not None


async def test_two_concurrent_imports_write_once(db_async: AsyncSession) -> None:
    """Both imports take the event's row lock; the second re-checks and is refused."""
    event = await make_event(db_async)
    content = b"number,barcode\n001,PX-IMP-1\n002,PX-IMP-2\n"

    async def run() -> PrintixImportReport:
        async with async_session_factory() as session:
            return await service.import_tickets(
                session, event.id, content, dry_run=False
            )

    reports = await asyncio.gather(run(), run())

    assert sorted(report.applied for report in reports) == [False, True]
    refused = next(report for report in reports if not report.applied)
    assert refused.errors
    count = await db_async.scalar(
        select(func.count(PrintixTicket.id)).where(PrintixTicket.event_id == event.id)
    )
    assert count == 2
