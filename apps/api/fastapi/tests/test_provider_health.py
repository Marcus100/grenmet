"""Provider failure signals: one warning per failed call, one error per streak."""

import logging
from collections.abc import Iterator

import pytest

from src import provider_health

LOGGER = "src.provider_health"


@pytest.fixture(autouse=True)
def _no_streaks() -> None:
    provider_health.reset()


@pytest.fixture
def records() -> Iterator[list[logging.LogRecord]]:
    """Capture on the module logger itself. caplog depends on test order: another
    test can reconfigure logging (propagate off, loggers disabled), as
    tests/test_global_error_handlers.py notes."""
    captured: list[logging.LogRecord] = []

    class _Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    target = logging.getLogger(LOGGER)
    handler = _Collect(level=logging.DEBUG)
    was_disabled, old_level = target.disabled, target.level
    target.disabled = False
    target.setLevel(logging.DEBUG)
    target.addHandler(handler)
    try:
        yield captured
    finally:
        target.removeHandler(handler)
        target.disabled = was_disabled
        target.setLevel(old_level)


def _errors(records: list[logging.LogRecord]) -> list[logging.LogRecord]:
    return [r for r in records if r.levelno >= logging.ERROR]


def test_failure_logs_area_and_error_class_never_the_error_text(
    records: list[logging.LogRecord],
) -> None:
    provider_health.record_failure(
        "stripe", "request", ValueError("token sk_test_secret in body")
    )
    [record] = records
    assert record.levelno == logging.WARNING
    assert record.getMessage() == provider_health.FAILED
    assert record.area == "provider.stripe.request"
    assert record.error_type == "ValueError"
    assert "sk_test_secret" not in record.getMessage()


def test_string_outcomes_are_recorded_as_the_error_type(
    records: list[logging.LogRecord],
) -> None:
    provider_health.record_failure("stripe", "request", "HTTP_503")
    [record] = records
    assert record.error_type == "HTTP_503"


def test_repeated_failures_log_one_error_at_the_threshold(
    records: list[logging.LogRecord],
) -> None:
    for _ in range(provider_health.ALERT_STREAK + 2):
        provider_health.record_failure("resend", "send", TimeoutError())
    assert [r.getMessage() for r in _errors(records)] == [provider_health.REPEATED]
    assert len(records) == provider_health.ALERT_STREAK + 3


def test_a_success_restarts_the_streak(records: list[logging.LogRecord]) -> None:
    for _ in range(provider_health.ALERT_STREAK - 1):
        provider_health.record_failure("resend", "send", TimeoutError())
    provider_health.record_success("resend", "send")
    for _ in range(provider_health.ALERT_STREAK - 1):
        provider_health.record_failure("resend", "send", TimeoutError())
    assert _errors(records) == []


def test_failures_spread_beyond_the_window_do_not_add_up(
    monkeypatch: pytest.MonkeyPatch, records: list[logging.LogRecord]
) -> None:
    clock = [1_000.0]
    monkeypatch.setattr(provider_health.time, "monotonic", lambda: clock[0])
    for _ in range(provider_health.ALERT_STREAK):
        provider_health.record_failure("nhc", "request", "Timeout")
        clock[0] += provider_health.WINDOW_SECONDS + 1
    assert _errors(records) == []


def test_streaks_are_per_call_site(records: list[logging.LogRecord]) -> None:
    for operation in ("put", "get", "delete"):
        for _ in range(provider_health.ALERT_STREAK - 1):
            provider_health.record_failure("storage", operation, "ClientError")
    assert _errors(records) == []


def test_unknown_provider_or_operation_is_a_programming_error() -> None:
    with pytest.raises(ValueError):
        provider_health.record_failure("unknown", "request", "x")
    with pytest.raises(ValueError):
        provider_health.record_success("stripe", "Bad Operation")


def test_watch_counts_only_listed_errors_and_reraises_them(
    records: list[logging.LogRecord],
) -> None:
    with pytest.raises(OSError):
        with provider_health.watch("storage", "get", errors=(OSError,)):
            raise OSError("socket closed")
    [record] = records
    assert record.area == "provider.storage.get"
    assert record.error_type == "OSError"


def test_watch_ignores_bugs_and_records_success_on_exit(
    records: list[logging.LogRecord],
) -> None:
    with pytest.raises(KeyError):
        with provider_health.watch("storage", "get", errors=(OSError,)):
            raise KeyError("programming error")
    assert records == []
    with provider_health.watch("storage", "get", errors=(OSError,)):
        pass
    assert ("storage", "get") not in provider_health._streaks


async def test_async_watch_reports_the_same_way(
    records: list[logging.LogRecord],
) -> None:
    with pytest.raises(TimeoutError):
        async with provider_health.watch(
            "opensky", "movements", errors=(TimeoutError,)
        ):
            raise TimeoutError
    [record] = records
    assert record.area == "provider.opensky.movements"
