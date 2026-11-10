"""Shared parts of the retry-queue lifecycle: allowed status moves and backoff.

Several queues (the transactional outbox, webhook deliveries, CAP jobs) run work,
record the outcome and wait before a retry. They share a shape but not stored
values or numbers, so this module holds only what is the same:

- ``RetryTable``: the status moves a domain allows between its own enum members.
  ``require`` raises ``RetryTransitionError`` before a caller writes a move that
  is not in the table.
- ``backoff_seconds``: ``base * 2 ** (attempts - 1)`` capped at a maximum.
- ``is_exhausted``: the attempt budget is used up.

Each domain keeps its own status enum (stored values differ), its own base and
cap, and its own SQL filters. Plain strings read from the database are accepted
as the current status, so a row loaded as ``"pending"`` checks against
``Status.PENDING``.
"""

from collections.abc import Iterable, Mapping
from enum import Enum


class RetryTransitionError(ValueError):
    """A status move the domain's table does not allow."""


def _value(status: str | Enum) -> str:
    return str(status.value) if isinstance(status, Enum) else status


class RetryTable[S: str | Enum]:
    """The moves a retry lifecycle allows. Terminal statuses map to an empty set."""

    def __init__(self, moves: Mapping[S, Iterable[S]]) -> None:
        self._moves: dict[str, frozenset[str]] = {
            _value(source): frozenset(_value(target) for target in targets)
            for source, targets in moves.items()
        }

    def allows(self, current: str | Enum, target: S) -> bool:
        return _value(target) in self._moves.get(_value(current), frozenset())

    def require(self, current: str | Enum, target: S) -> None:
        if not self.allows(current, target):
            raise RetryTransitionError(
                f"Retry status cannot move from {_value(current)} to {_value(target)}"
            )


def backoff_seconds(attempts: int, *, base_seconds: int, max_seconds: int) -> int:
    """Delay after the ``attempts``-th failure: base, 2x base, ... capped.

    ``attempts`` below 1 is treated as the first failure."""
    return min(base_seconds << max(attempts - 1, 0), max_seconds)


def is_exhausted(attempts: int, max_attempts: int) -> bool:
    """True when no attempt is left after ``attempts`` tries."""
    return attempts >= max_attempts
