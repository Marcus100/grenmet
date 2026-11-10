"""Almanac exceptions (typed ``AppException`` subclasses)."""

from src.exceptions import AppValidationError


class AlmanacRangeError(AppValidationError):
    """The requested date range is empty, reversed or longer than the public limit."""
