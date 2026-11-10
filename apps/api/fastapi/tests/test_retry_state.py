"""Table-driven tests for the shared retry lifecycle helper (src/utils/retry_state.py)."""

from enum import Enum

import pytest

from src.utils.retry_state import (
    RetryTable,
    RetryTransitionError,
    backoff_seconds,
    is_exhausted,
)


class Status(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    DEAD = "dead"


TABLE = RetryTable[Status](
    {
        Status.QUEUED: {Status.RUNNING, Status.DEAD},
        Status.RUNNING: {Status.RUNNING, Status.DONE, Status.FAILED, Status.DEAD},
        Status.FAILED: {Status.RUNNING},
        Status.DONE: frozenset(),
        Status.DEAD: frozenset(),
    }
)


@pytest.mark.parametrize(
    ("current", "target", "allowed"),
    [
        (Status.QUEUED, Status.RUNNING, True),
        (Status.QUEUED, Status.DONE, False),
        (Status.RUNNING, Status.RUNNING, True),
        (Status.RUNNING, Status.DONE, True),
        (Status.RUNNING, Status.QUEUED, False),
        (Status.FAILED, Status.RUNNING, True),
        (Status.FAILED, Status.DONE, False),
        (Status.DONE, Status.RUNNING, False),
        (Status.DEAD, Status.DEAD, False),
        # Values read from the database are plain strings.
        ("queued", Status.RUNNING, True),
        ("done", Status.RUNNING, False),
        # A status the table does not know is not allowed anywhere.
        ("unknown", Status.RUNNING, False),
    ],
)
def test_allows(current: str | Status, target: Status, allowed: bool) -> None:
    assert TABLE.allows(current, target) is allowed


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (Status.QUEUED, Status.DONE),
        ("done", Status.FAILED),
        ("unknown", Status.DEAD),
    ],
)
def test_require_raises_for_a_refused_move(
    current: str | Status, target: Status
) -> None:
    with pytest.raises(RetryTransitionError, match="cannot move from"):
        TABLE.require(current, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [(Status.QUEUED, Status.RUNNING), ("failed", Status.RUNNING)],
)
def test_require_accepts_an_allowed_move(current: str | Status, target: Status) -> None:
    TABLE.require(current, target)


def test_transition_error_is_a_value_error() -> None:
    assert issubclass(RetryTransitionError, ValueError)


@pytest.mark.parametrize(
    ("attempts", "expected"),
    [
        (0, 60),  # below the first failure counts as the first failure
        (1, 60),
        (2, 120),
        (3, 240),
        (6, 1920),
        (7, 3600),  # capped
        (20, 3600),
    ],
)
def test_backoff_doubles_then_caps(attempts: int, expected: int) -> None:
    assert backoff_seconds(attempts, base_seconds=60, max_seconds=3600) == expected


@pytest.mark.parametrize(
    ("attempts", "max_attempts", "expected"),
    [
        (0, 5, False),
        (4, 5, False),
        (5, 5, True),
        (6, 5, True),
        (1, 1, True),
    ],
)
def test_is_exhausted(attempts: int, max_attempts: int, expected: bool) -> None:
    assert is_exhausted(attempts, max_attempts) is expected
