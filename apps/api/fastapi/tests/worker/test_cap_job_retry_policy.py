"""Pins the CAP job retry numbers and status moves (src/worker/dispatch.py)."""

import pytest

from src.cap.models import CapJobStatus
from src.utils.retry_state import RetryTransitionError
from src.worker import dispatch


@pytest.mark.parametrize(
    ("attempts", "seconds"),
    [(1, 10), (2, 20), (3, 40), (4, 80), (9, 2560), (10, 3600), (20, 3600)],
)
def test_job_retry_delay_doubles_from_ten_seconds_and_caps_at_an_hour(
    attempts: int, seconds: int
) -> None:
    assert dispatch._retry_delay_seconds(attempts) == seconds


@pytest.mark.parametrize("source", [CapJobStatus.QUEUED, CapJobStatus.FAILED])
def test_a_waiting_job_is_claimed_or_skipped_when_its_channel_is_retired(
    source: CapJobStatus,
) -> None:
    assert dispatch.STATUS_MOVES.allows(source, CapJobStatus.RUNNING)
    assert dispatch.STATUS_MOVES.allows(source, CapJobStatus.SKIPPED)
    assert not dispatch.STATUS_MOVES.allows(source, CapJobStatus.SUCCEEDED)


@pytest.mark.parametrize(
    "target",
    [
        CapJobStatus.RUNNING,  # a stale claim is taken again
        CapJobStatus.SUCCEEDED,
        CapJobStatus.SKIPPED,
        CapJobStatus.FAILED,
    ],
)
def test_a_running_job_ends_succeeded_skipped_or_failed(target: CapJobStatus) -> None:
    assert dispatch.STATUS_MOVES.allows(CapJobStatus.RUNNING, target)


@pytest.mark.parametrize("finished", [CapJobStatus.SUCCEEDED, CapJobStatus.SKIPPED])
def test_a_finished_job_never_moves_again(finished: CapJobStatus) -> None:
    for target in CapJobStatus:
        with pytest.raises(RetryTransitionError):
            dispatch.STATUS_MOVES.require(finished, target)
