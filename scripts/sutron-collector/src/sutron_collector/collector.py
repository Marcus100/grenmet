from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sutron_collector.models import CollectedBatch
from sutron_collector.parser import parse_response
from sutron_collector.transport import QueryTransport

SHOW_TAG_COMMAND = b"show /tag /c\r\n"
Clock = Callable[[], datetime]


class NoObservationsError(RuntimeError):
    """Raised when every bounded collection attempt returns no observations."""


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Collector:
    transport: QueryTransport
    station_name: str
    station_id: int
    attempts: int = 3
    clock: Clock = utc_now

    def __post_init__(self) -> None:
        if not self.station_name:
            raise ValueError("station name cannot be empty")
        if self.station_id <= 0:
            raise ValueError("station ID must be positive")
        if self.attempts <= 0:
            raise ValueError("attempt count must be positive")

    def collect_once(self) -> CollectedBatch:
        for _attempt in range(1, self.attempts + 1):
            observations = parse_response(self.transport.query(SHOW_TAG_COMMAND))
            if observations:
                return CollectedBatch(
                    station_name=self.station_name,
                    station_id=self.station_id,
                    collected_at=self.clock(),
                    observations=observations,
                )

        raise NoObservationsError(
            f"station {self.station_name} returned no observations after "
            f"{self.attempts} attempts"
        )
