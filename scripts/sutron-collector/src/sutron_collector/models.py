from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Observation:
    """One tagged value returned by the Sutron logger."""

    tag: str
    value: Decimal
    status_tokens: tuple[str, ...]
    raw_line: str

    def __post_init__(self) -> None:
        if not self.tag:
            raise ValueError("observation tag cannot be empty")
        if not self.status_tokens:
            raise ValueError("observation must include at least one status token")


@dataclass(frozen=True, slots=True)
class CollectedBatch:
    """Observations collected from one station query."""

    station_name: str
    station_id: int
    collected_at: datetime
    observations: tuple[Observation, ...]

    def __post_init__(self) -> None:
        if not self.station_name:
            raise ValueError("station name cannot be empty")
        if self.station_id <= 0:
            raise ValueError("station ID must be positive")
        if self.collected_at.utcoffset() is None:
            raise ValueError("collection timestamp must include a timezone")
        if not self.observations:
            raise ValueError("collected batch cannot be empty")
