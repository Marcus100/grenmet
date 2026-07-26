from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from sutron_collector.collector import (
    SHOW_TAG_COMMAND,
    Collector,
    NoObservationsError,
)
from sutron_collector.transport import (
    WAKE_SEQUENCE,
    SerialSettings,
    SerialTransport,
)


class FakeTransport:
    def __init__(self, responses: list[bytes]) -> None:
        self._responses = iter(responses)
        self.commands: list[bytes] = []

    def query(self, command: bytes) -> bytes:
        self.commands.append(command)
        return next(self._responses)


def fixed_clock() -> datetime:
    return datetime(2026, 7, 19, 4, 26, tzinfo=UTC)


def make_collector(transport: FakeTransport, *, attempts: int = 3) -> Collector:
    clock: Callable[[], datetime] = fixed_clock
    return Collector(
        transport=transport,
        station_name="MAURICEBISHOPINTL",
        station_id=13000,
        attempts=attempts,
        clock=clock,
    )


def test_collect_once_sends_exact_command_and_adds_station_context() -> None:
    transport = FakeTransport([b"QNH 1011.8 G OK\r\n"])

    batch = make_collector(transport).collect_once()

    assert transport.commands == [SHOW_TAG_COMMAND]
    assert SHOW_TAG_COMMAND == b"show /tag /c\r\n"
    assert batch.station_name == "MAURICEBISHOPINTL"
    assert batch.station_id == 13000
    assert batch.collected_at == fixed_clock()
    assert batch.observations[0].value == Decimal("1011.8")


def test_collect_once_retries_an_empty_response() -> None:
    transport = FakeTransport([b"prompt only\r\n", b"AT 26.1 G OK\r\n"])

    batch = make_collector(transport).collect_once()

    assert len(transport.commands) == 2
    assert batch.observations[0].tag == "AT"


def test_collect_once_stops_after_bounded_attempts() -> None:
    transport = FakeTransport([b"", b"", b""])

    with pytest.raises(NoObservationsError, match="3 attempts"):
        make_collector(transport).collect_once()

    assert len(transport.commands) == 3


class FakeSerialConnection:
    def __init__(self, reads: list[bytes]) -> None:
        self._reads = iter(reads)
        self.writes: list[bytes] = []
        self.read_sizes: list[int] = []
        self.input_resets = 0
        self.output_resets = 0
        self.flushes = 0
        self.closed = False

    def reset_input_buffer(self) -> None:
        self.input_resets += 1

    def reset_output_buffer(self) -> None:
        self.output_resets += 1

    def write(self, data: bytes) -> int:
        self.writes.append(data)
        return len(data)

    def flush(self) -> None:
        self.flushes += 1

    def read(self, size: int) -> bytes:
        self.read_sizes.append(size)
        return next(self._reads)

    def close(self) -> None:
        self.closed = True


def test_serial_transport_wakes_logger_then_sends_command() -> None:
    settings = SerialSettings(port="/dev/ttyS1")
    connection = FakeSerialConnection([b"logger banner", b"AT 26.1 G OK\r\n"])
    opened_with: list[SerialSettings] = []

    def open_fake(received: SerialSettings) -> FakeSerialConnection:
        opened_with.append(received)
        return connection

    transport = SerialTransport(settings=settings, opener=open_fake)

    response = transport.query(SHOW_TAG_COMMAND)

    assert opened_with == [settings]
    assert connection.input_resets == 1
    assert connection.output_resets == 1
    assert connection.writes == [WAKE_SEQUENCE, SHOW_TAG_COMMAND]
    assert connection.flushes == 2
    assert connection.read_sizes == [5000, 5000]
    assert connection.closed is True
    assert response == b"AT 26.1 G OK\r\n"
