"""Pins the outbox's retry numbers and status moves (src/outbox.py)."""

import pytest

from src import outbox
from src.utils.retry_state import RetryTransitionError


@pytest.mark.parametrize(
    ("attempts", "seconds"),
    [(1, 60), (2, 120), (3, 240), (4, 480), (5, 960), (6, 1920), (7, 3600), (9, 3600)],
)
def test_retry_delay_doubles_from_a_minute_and_caps_at_an_hour(
    attempts: int, seconds: int
) -> None:
    assert outbox.retry_delay_seconds(attempts) == seconds


def test_the_row_is_dead_after_five_attempts() -> None:
    assert outbox.MAX_ATTEMPTS == 5


def test_a_pending_row_can_only_finish_or_die() -> None:
    assert outbox.STATUS_MOVES.allows(
        outbox.OutboxStatus.PENDING, outbox.OutboxStatus.DONE
    )
    assert outbox.STATUS_MOVES.allows(
        outbox.OutboxStatus.PENDING, outbox.OutboxStatus.DEAD
    )
    # A retry keeps the row pending, so pending to pending is not a status move.
    assert not outbox.STATUS_MOVES.allows(
        outbox.OutboxStatus.PENDING, outbox.OutboxStatus.PENDING
    )


@pytest.mark.parametrize(
    "finished", [outbox.OutboxStatus.DONE, outbox.OutboxStatus.DEAD]
)
def test_a_finished_row_never_moves_again(finished: outbox.OutboxStatus) -> None:
    for target in outbox.OutboxStatus:
        with pytest.raises(RetryTransitionError):
            outbox.STATUS_MOVES.require(finished, target)
