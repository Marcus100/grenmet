"""Failure signals for outbound providers (Stripe, Resend, OpenSky, Copernicus,
wis2box, Turnstile, storage, NHC).

A failed provider call logs one WARNING (it reaches Sentry Logs) with the call
site in ``area`` (``provider.<name>.<operation>``) and the exception class in
``error_type``. When one call site fails ``ALERT_STREAK`` times in a row within
``WINDOW_SECONDS``, one ERROR is logged, and Sentry records that as an event. The
streak restarts after any success. Retries inside an SDK are not counted: a caller
reports the final outcome of its call.

Counts live in each process, so the threshold is per API or worker process.
Nothing here carries URLs, payloads, keys, response bodies or identities.
"""

from __future__ import annotations

import logging
import re
import time
from types import TracebackType
from typing import Any

logger = logging.getLogger(__name__)

PROVIDERS = frozenset(
    {
        "copernicus",
        "nhc",
        "opensky",
        "resend",
        "storage",
        "stripe",
        "turnstile",
        "wis2box",
    }
)
ALERT_STREAK = 3
WINDOW_SECONDS = 900.0
_OPERATION = re.compile(r"[a-z][a-z0-9-]{0,30}")
FAILED = "Provider call failed"
REPEATED = "Provider failing repeatedly"


class _Streak:
    __slots__ = ("count", "last")

    def __init__(self) -> None:
        self.count = 0
        self.last = 0.0


_streaks: dict[tuple[str, str], _Streak] = {}


def _check(provider: str, operation: str) -> None:
    if provider not in PROVIDERS or _OPERATION.fullmatch(operation) is None:
        raise ValueError("unknown provider or operation name")


def _error_type(error: BaseException | str) -> str:
    return error if isinstance(error, str) else type(error).__name__


def record_failure(provider: str, operation: str, error: BaseException | str) -> None:
    """Count one failed provider call and log it.

    An unknown provider or operation name raises ValueError: that is a bug in the
    caller. Otherwise this does not raise, so it cannot break the call it reports."""
    _check(provider, operation)
    key = (provider, operation)
    streak = _streaks.setdefault(key, _Streak())
    now = time.monotonic()
    if now - streak.last > WINDOW_SECONDS:
        streak.count = 0
    streak.count += 1
    streak.last = now
    extra: dict[str, Any] = {
        "area": f"provider.{provider}.{operation}",
        "error_type": _error_type(error),
    }
    logger.warning(FAILED, extra=extra)
    if streak.count == ALERT_STREAK:
        logger.error(REPEATED, extra=extra)


def record_success(provider: str, operation: str) -> None:
    """A successful call ends the failure streak for this call site."""
    _check(provider, operation)
    _streaks.pop((provider, operation), None)


class watch:
    """Context manager (sync or async) that reports one provider call.

    Only exceptions listed in ``errors`` count as provider failures and are
    re-raised unchanged. Any other exception is a bug and propagates without
    being counted.
    """

    def __init__(
        self,
        provider: str,
        operation: str,
        *,
        errors: tuple[type[BaseException], ...],
    ) -> None:
        _check(provider, operation)
        self._provider = provider
        self._operation = operation
        self._errors = errors

    # Exits return None, never True: this never swallows an exception, and mypy
    # would otherwise assume the code after a `with watch(...)` can be skipped.
    def _exit(self, exc: BaseException | None) -> None:
        if exc is None:
            record_success(self._provider, self._operation)
        elif isinstance(exc, self._errors):
            record_failure(self._provider, self._operation, exc)

    def __enter__(self) -> watch:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self._exit(exc)

    async def __aenter__(self) -> watch:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self._exit(exc)


def reset() -> None:
    """Forget every streak (tests)."""
    _streaks.clear()
