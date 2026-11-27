"""Pins the WIS2 transfer retry numbers and the exhausted transition (src/eregister/publisher.py).

No database: ``_deliver`` works on one ``ERegisterSend`` row and a sink callable.
"""

from datetime import timedelta
from uuid import uuid4

import pytest

from src.eregister import publisher
from src.eregister.models import STATUS_FAILED, STATUS_QUEUED, STATUS_SENT, ERegisterSend
from src.utils.datetime import utc_now

TOLERANCE = timedelta(seconds=5)


def _row() -> ERegisterSend:
    # attempts starts at 0 as the column default would set it on insert.
    return ERegisterSend(
        id=uuid4(),
        status=STATUS_QUEUED,
        attempts=0,
        detail={"key": "wis2/a.csv", "content": "a,b"},
    )


@pytest.mark.parametrize(
    ("attempts", "seconds"),
    [(0, 60), (1, 60), (2, 120), (3, 240), (4, 480), (7, 3600), (30, 3600)],
)
def test_transfer_retry_delay_doubles_from_a_minute_and_caps_at_an_hour(
    attempts: int, seconds: int
) -> None:
    assert publisher.retry_delay_seconds(attempts) == seconds


@pytest.mark.parametrize(
    ("sink_fails", "max_attempts", "expected_delays", "final_status"),
    [
        # Retries wait 60 s, then 120 s; the third failure ends the row.
        (True, 3, [60, 120], STATUS_FAILED),
        # One attempt allowed: the first failure already ends the row.
        (True, 1, [], STATUS_FAILED),
        # A transfer that lands is sent on the first try, with no wait.
        (False, 3, [], STATUS_SENT),
    ],
)
async def test_transfer_sequence_of_delays_and_exhausted_transition(
    sink_fails: bool,
    max_attempts: int,
    expected_delays: list[int],
    final_status: str,
) -> None:
    calls: list[str] = []

    def sink(key: str, content: str) -> None:
        calls.append(key)
        if sink_fails:
            raise RuntimeError("wis2box unreachable")

    row = _row()
    delays: list[timedelta] = []
    for _ in range(max_attempts):
        before = utc_now()
        landed = await publisher._deliver(row, sink, max_attempts)
        if row.next_retry_at is not None:
            delays.append(row.next_retry_at - before)
        if landed:
            break

    assert len(delays) == len(expected_delays)
    for seconds, delay in zip(expected_delays, delays, strict=True):
        assert timedelta(seconds=seconds) - TOLERANCE <= delay
        assert delay <= timedelta(seconds=seconds) + TOLERANCE
    assert row.status == final_status
    assert len(calls) == row.attempts
    if final_status == STATUS_FAILED:
        # Exhausted: nothing is scheduled, so the due-selection never picks it again.
        assert row.next_retry_at is None
        assert row.attempts == max_attempts
    else:
        assert row.next_retry_at is None
        assert row.sent_at is not None
        assert "content" not in row.detail


async def test_exhausted_row_keeps_its_last_error_for_the_operator() -> None:
    def sink(key: str, content: str) -> None:
        raise ValueError("bad key")

    row = _row()
    await publisher._deliver(row, sink, 1)
    assert row.status == STATUS_FAILED
    assert row.last_error == "bad key"
