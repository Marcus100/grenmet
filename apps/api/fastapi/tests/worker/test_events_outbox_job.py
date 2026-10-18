"""The Events outbox drain is scheduled and does nothing without an Events database."""

import pytest

from src.worker import main


def test_drain_job_is_registered_and_scheduled() -> None:
    assert main.drain_events_outbox in main.WorkerSettings.functions
    scheduled = {job.coroutine for job in main.WorkerSettings.cron_jobs}
    assert main.drain_events_outbox in scheduled


@pytest.mark.asyncio
async def test_drain_job_is_a_noop_without_an_events_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.events import database

    monkeypatch.setattr(database, "create_session", lambda: None)
    assert await main.drain_events_outbox({}) == 0
