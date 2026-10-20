"""The paid-tier order sweeper and its outbox topics are wired into the worker (N4b)."""

import pytest

from src import outbox
from src.worker import main


def test_the_sweeper_is_registered_and_scheduled() -> None:
    assert main.expire_unpaid_event_orders in main.WorkerSettings.functions
    scheduled = {job.coroutine for job in main.WorkerSettings.cron_jobs}
    assert main.expire_unpaid_event_orders in scheduled


@pytest.mark.asyncio
async def test_startup_registers_the_events_payment_topics() -> None:
    await main.startup({})
    topics = outbox.registered_topics()
    assert "events.order_paid" in topics
    assert "events.order_refunded" in topics


@pytest.mark.asyncio
async def test_the_sweeper_is_a_noop_without_an_events_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.events import database

    monkeypatch.setattr(database, "create_session", lambda: None)
    assert await main.expire_unpaid_event_orders({}) == 0
