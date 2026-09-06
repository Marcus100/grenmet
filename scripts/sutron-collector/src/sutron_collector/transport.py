from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, cast

import serial  # type: ignore[import-untyped]

WAKE_SEQUENCE = b"\r\n"

# The logger returns to this prompt once it has finished speaking, so its
# arrival proves the reply is complete rather than merely paused. Confirmed
# against the live station at Maurice Bishop on 2026-08-15.
LOGGER_PROMPT = b"\\Flash Disk>"


class QueryTransport(Protocol):
    """Transport capable of sending one logger command and returning its reply."""

    def query(self, command: bytes) -> bytes: ...


class SerialConnection(Protocol):
    """Small subset of pySerial used by the collector."""

    def reset_input_buffer(self) -> None: ...

    def reset_output_buffer(self) -> None: ...

    def write(self, data: bytes) -> int: ...

    def flush(self) -> None: ...

    def read(self, size: int) -> bytes: ...

    def read_until(self, expected: bytes, size: int | None = None) -> bytes: ...

    def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class SerialSettings:
    port: str
    baudrate: int = 9600
    timeout: float = 5.0
    max_bytes: int = 5000

    def __post_init__(self) -> None:
        if not self.port:
            raise ValueError("serial port cannot be empty")
        if self.baudrate <= 0:
            raise ValueError("baud rate must be positive")
        if self.timeout <= 0:
            raise ValueError("serial timeout must be positive")
        if self.max_bytes <= 0:
            raise ValueError("maximum read size must be positive")


PortOpener = Callable[[SerialSettings], SerialConnection]


def open_pyserial(settings: SerialSettings) -> SerialConnection:
    """Open pySerial with the legacy collector's explicit 8N1 settings."""

    return cast(
        SerialConnection,
        serial.Serial(
            port=settings.port,
            baudrate=settings.baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=settings.timeout,
            write_timeout=settings.timeout,
            xonxoff=False,
            rtscts=False,
            dsrdtr=False,
        ),
    )


@dataclass(slots=True)
class SerialTransport:
    settings: SerialSettings
    opener: PortOpener = open_pyserial

    def query(self, command: bytes) -> bytes:
        if not command:
            raise ValueError("logger command cannot be empty")

        connection = self.opener(self.settings)
        try:
            connection.reset_input_buffer()
            connection.reset_output_buffer()
            self._write(connection, WAKE_SEQUENCE)
            self._read_reply(connection)
            self._write(connection, command)
            return self._read_reply(connection)
        finally:
            connection.close()

    def _read_reply(self, connection: SerialConnection) -> bytes:
        """Read until the logger prompt, the serial timeout, or the byte cap.

        `read(n)` is the wrong tool here. It waits for *exactly* n bytes and
        only gives up when the timeout expires, so asking for 5000 bytes of a
        655-byte reply costs the full timeout every single poll -- measured at
        5.01s per read against a simulated station. Reading in smaller chunks
        does not help: each chunk waits for itself to fill.

        `read_until` returns the moment the terminator appears, so a complete
        reply costs only the time the bytes take to arrive. It also caps the
        read and honours the timeout, giving all three exits at once:

        1. the prompt appears -- the reply is provably complete;
        2. the timeout expires -- partial data is returned, which is the
           original behaviour and the fallback if the prompt ever changes;
        3. the byte cap is reached -- a logger stuck talking cannot exhaust
           memory.
        """
        return connection.read_until(LOGGER_PROMPT, self.settings.max_bytes)

    @staticmethod
    def _write(connection: SerialConnection, payload: bytes) -> None:
        bytes_written = connection.write(payload)
        if bytes_written != len(payload):
            message = (
                "serial write incomplete: "
                f"wrote {bytes_written} of {len(payload)} bytes"
            )
            raise OSError(message)
        connection.flush()
