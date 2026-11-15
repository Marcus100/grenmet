"""Scan-log retention: rows go 90 days after their event's close time, nothing sooner."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import constants, service
from src.printix.models import PrintixScanLog
from src.utils.datetime import utc_now

from .support import make_event, make_pairing, make_ticket, scan

pytestmark = pytest.mark.usefixtures("db_async")


async def _logs_for(db: AsyncSession, pairing_id: object) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(PrintixScanLog)
            .where(PrintixScanLog.pairing_id == pairing_id)
        )
        or 0
    )


async def test_scan_logs_of_an_event_closed_over_ninety_days_ago_are_purged(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    old = await make_event(db_async, name="Old")
    recent = await make_event(db_async, name="Recent")
    await make_ticket(db_async, old, "001")
    await make_ticket(db_async, recent, "001")
    old_pairing, old_secret = await make_pairing(db_async, old)
    recent_pairing, recent_secret = await make_pairing(db_async, recent)
    await scan(async_client, old_secret, "001")
    await scan(async_client, recent_secret, "001")
    old.closes_at = utc_now() - timedelta(days=constants.SCAN_LOG_RETENTION_DAYS + 1)
    recent.closes_at = utc_now() - timedelta(days=constants.SCAN_LOG_RETENTION_DAYS - 1)
    await db_async.commit()

    deleted = await service.purge_scan_log(db_async, now=utc_now())

    assert deleted == 1
    assert await _logs_for(db_async, old_pairing.id) == 0
    assert await _logs_for(db_async, recent_pairing.id) == 1


async def test_the_purge_is_a_worker_job() -> None:
    from src.domains import worker_jobs

    names = {function.__name__ for function, _ in worker_jobs()}

    assert "purge_scan_log" in names
