"""The declared dead-to-pending move (``outbox.rearm``) and its cap on re-arms."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now
from src.utils.retry_state import RetryTransitionError


def _topic() -> str:
    return f"test.{uuid.uuid4().hex[:12]}"


def _row(status: OutboxStatus, *, attempts: int = 5, rearms: int = 0) -> Outbox:
    return Outbox(
        id=uuid.uuid4(),
        topic="test.rearm",
        payload={},
        dedupe_key="k",
        status=status.value,
        attempts=attempts,
        rearms=rearms,
        next_attempt_at=utc_now(),
        last_error="RuntimeError",
    )


async def _dead_row(db: AsyncSession, topic: str, *, rearms: int = 0) -> uuid.UUID:
    row = Outbox(
        id=uuid.uuid4(),
        topic=topic,
        payload={},
        dedupe_key="k",
        status=OutboxStatus.DEAD.value,
        attempts=5,
        rearms=rearms,
        next_attempt_at=utc_now(),
    )
    db.add(row)
    await db.commit()
    return row.id


async def _reload(db: AsyncSession, row_id: uuid.UUID) -> Outbox:
    row = await db.scalar(
        select(Outbox)
        .where(Outbox.id == row_id)
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


def test_rearm_is_a_declared_move_that_resets_attempts_and_counts_it() -> None:
    row = _row(OutboxStatus.DEAD)
    moment = utc_now()
    outbox.rearm(row, moment)
    assert (row.status, row.attempts, row.rearms) == (OutboxStatus.PENDING.value, 0, 1)
    assert (row.next_attempt_at, row.last_error) == (moment, None)


@pytest.mark.parametrize("status", [OutboxStatus.PENDING, OutboxStatus.DONE])
def test_an_undeclared_move_to_pending_is_still_refused(status: OutboxStatus) -> None:
    row = _row(status, attempts=1)
    with pytest.raises(RetryTransitionError):
        outbox.rearm(row, utc_now())
    assert (row.status, row.attempts, row.rearms) == (status.value, 1, 0)


def test_a_row_at_the_cap_is_refused_and_stays_dead() -> None:
    row = _row(OutboxStatus.DEAD, rearms=outbox.MAX_REARMS)
    with pytest.raises(outbox.RearmRefused):
        outbox.rearm(row, utc_now())
    assert (row.status, row.attempts, row.rearms) == (
        OutboxStatus.DEAD.value,
        5,
        outbox.MAX_REARMS,
    )


def test_the_cap_is_reached_after_max_rearms_and_counts_across_rearms() -> None:
    row = _row(OutboxStatus.DEAD)
    for expected in range(1, outbox.MAX_REARMS + 1):
        outbox.rearm(row, utc_now())
        assert row.rearms == expected
        row.status = OutboxStatus.DEAD.value  # it failed again
    with pytest.raises(outbox.RearmRefused):
        outbox.rearm(row, utc_now())


async def test_a_re_armed_row_is_picked_up_by_the_drain(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    topic = _topic()
    calls: list[OutboxMessage] = []

    async def succeed(_: AsyncSession, message: OutboxMessage) -> None:
        calls.append(message)

    monkeypatch.setitem(outbox._HANDLERS, topic, succeed)
    row_id = await _dead_row(db_async, topic)
    row = await _reload(db_async, row_id)
    outbox.rearm(row, utc_now())
    await db_async.commit()

    await outbox.drain(db_async, only_topics=[topic])
    row = await _reload(db_async, row_id)
    assert len(calls) == 1
    assert row.status == OutboxStatus.DONE.value


async def test_a_re_armed_row_gets_a_full_attempt_budget(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Without the attempt reset, one more failure would declare the row dead at once
    # (it still carries the exhausted count of five). It must instead retry normally.
    topic = _topic()

    async def fail(_: AsyncSession, __: OutboxMessage) -> None:
        raise RuntimeError("provider still down")

    monkeypatch.setitem(outbox._HANDLERS, topic, fail)
    row_id = await _dead_row(db_async, topic)
    outbox.rearm(await _reload(db_async, row_id), utc_now())
    await db_async.commit()

    await outbox.drain(db_async, only_topics=[topic])
    row = await _reload(db_async, row_id)
    assert (row.status, row.attempts, row.rearms) == (OutboxStatus.PENDING.value, 1, 1)
