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


def test_the_row_is_re_armed_at_most_three_times() -> None:
    assert outbox.MAX_REARMS == 3


@pytest.mark.parametrize(
    "target", [t for t in outbox.OutboxStatus if t is not outbox.OutboxStatus.PENDING]
)
def test_a_done_row_never_moves_again(target: outbox.OutboxStatus) -> None:
    with pytest.raises(RetryTransitionError):
        outbox.STATUS_MOVES.require(outbox.OutboxStatus.DONE, target)


def test_a_dead_row_moves_only_back_to_pending() -> None:
    # The one declared move out of dead: the operator's re-arm (outbox.rearm).
    assert outbox.STATUS_MOVES.allows(
        outbox.OutboxStatus.DEAD, outbox.OutboxStatus.PENDING
    )
    for target in (outbox.OutboxStatus.DONE, outbox.OutboxStatus.DEAD):
        with pytest.raises(RetryTransitionError):
            outbox.STATUS_MOVES.require(outbox.OutboxStatus.DEAD, target)
