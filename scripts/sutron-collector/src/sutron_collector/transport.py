from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, cast

import serial  # type: ignore[import-untyped]

WAKE_SEQUENCE = b"\r\n"


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
            connection.read(self.settings.max_bytes)
            self._write(connection, command)
            return connection.read(self.settings.max_bytes)
        finally:
            connection.close()

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
