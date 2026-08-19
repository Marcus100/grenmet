"""Durable local record of every reading, on the edge machine.

The SURFACE handoff is deliberately transient: files are written for an FTP
pull and SURFACE deletes them once ingested. That leaves no copy on the edge
machine, so this store is the durable record.

It also holds something the handoff cannot. SURFACE's CSV format carries values
only, so the logger's own quality flags are lost in transit -- a battery
reading of ``0.0 B`` ("my measurement is broken") arrives indistinguishable
from a genuine zero. Legacy discarded those flags too. Here they are kept.
"""

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import TracebackType

from sutron_collector.models import CollectedBatch

SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
    station_name   TEXT    NOT NULL,
    station_id     INTEGER NOT NULL,
    observed_at    TEXT    NOT NULL,
    tag            TEXT    NOT NULL,
    -- TEXT, never REAL: REAL is a float, and float arithmetic is exactly what
    -- turned 78.1 into 78.09 in the legacy exporter.
    value          TEXT    NOT NULL,
    status_tokens  TEXT    NOT NULL,
    raw_line       TEXT    NOT NULL,
    PRIMARY KEY (station_id, observed_at, tag)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS observations_by_time
    ON observations (observed_at DESC);
"""


@dataclass(frozen=True, slots=True)
class StoredReading:
    """One reading as held on disk."""

    station_name: str
    station_id: int
    observed_at: datetime
    tag: str
    value: Decimal
    status_tokens: tuple[str, ...]
    raw_line: str


class ObservationStore:
    """SQLite-backed archive of collected readings.

    Usable as a context manager so the connection is always closed:

        with ObservationStore(path) as store:
            store.save(batch)
    """

    def __init__(self, database: Path | str) -> None:
        self.path = Path(database)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        self._connection = sqlite3.connect(self.path)
        self._connection.row_factory = sqlite3.Row

        # WAL lets a reader (a dashboard, an operator) query the archive while
        # a poll is writing, instead of hitting "database is locked".
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._connection.executescript(SCHEMA)
        self._connection.commit()

    def __enter__(self) -> "ObservationStore":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._connection.close()

    def save(self, batch: CollectedBatch) -> int:
        """Store every observation in a batch, replacing any already held.

        The primary key is (station, time, tag), so re-running a poll updates
        in place rather than duplicating. A retry after a partial failure is
        therefore safe.
        """
        rows = [
            (
                batch.station_name,
                batch.station_id,
                batch.collected_at.isoformat(),
                observation.tag,
                str(observation.value),
                " ".join(observation.status_tokens),
                observation.raw_line,
            )
            for observation in batch.observations
        ]

        with self._connection:
            self._connection.executemany(
                """
                INSERT INTO observations (
                    station_name, station_id, observed_at,
                    tag, value, status_tokens, raw_line
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (station_id, observed_at, tag) DO UPDATE SET
                    value         = excluded.value,
                    status_tokens = excluded.status_tokens,
                    raw_line      = excluded.raw_line
                """,
                rows,
            )

        return len(rows)

    def readings(self, *, limit: int | None = None) -> list[StoredReading]:
        """Return stored readings, most recent first."""
        query = "SELECT * FROM observations ORDER BY observed_at DESC, tag ASC"
        parameters: tuple[int, ...] = ()

        if limit is not None:
            query += " LIMIT ?"
            parameters = (limit,)

        cursor = self._connection.execute(query, parameters)
        return [
            StoredReading(
                station_name=row["station_name"],
                station_id=row["station_id"],
                observed_at=datetime.fromisoformat(row["observed_at"]),
                tag=row["tag"],
                value=Decimal(row["value"]),
                status_tokens=tuple(row["status_tokens"].split()),
                raw_line=row["raw_line"],
            )
            for row in cursor
        ]

    def count(self) -> int:
        """How many readings are held."""
        cursor = self._connection.execute("SELECT COUNT(*) AS total FROM observations")
        return int(cursor.fetchone()["total"])
