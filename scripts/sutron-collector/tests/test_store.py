from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sutron_collector.models import CollectedBatch, Observation
from sutron_collector.store import ObservationStore


def observation(tag: str, value: str, *, status: str = "G") -> Observation:
    return Observation(
        tag=tag,
        value=Decimal(value),
        status_tokens=(status, "OK"),
        raw_line=f"{tag} {value} {status} OK",
    )


def batch(*observations: Observation, at: datetime | None = None) -> CollectedBatch:
    return CollectedBatch(
        station_name="MAURICEBISHOPINTL",
        station_id=13000,
        collected_at=at or datetime(2026, 8, 15, 14, 6, tzinfo=UTC),
        observations=observations,
    )


def test_store_creates_its_schema_on_first_use(tmp_path: Path) -> None:
    database = tmp_path / "observations.db"
    with ObservationStore(database) as store:
        store.save(batch(observation("AT", "29.5")))

    assert database.exists()


def test_store_round_trips_a_reading(tmp_path: Path) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(batch(observation("AT", "29.5")))
        rows = store.readings()

    assert len(rows) == 1
    assert rows[0].tag == "AT"
    assert rows[0].value == Decimal("29.5")


def test_store_preserves_decimals_exactly(tmp_path: Path) -> None:
    """Values are stored as text, never as SQLite REAL.

    REAL is a float, which is what corrupted 78.1 into 78.09 in the legacy
    exporter. Text keeps the decimal exact all the way through.
    """
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(batch(observation("RH", "78.1")))
        value = store.readings()[0].value

    assert value == Decimal("78.1")
    assert str(value) == "78.1"


def test_store_keeps_quality_flags(tmp_path: Path) -> None:
    """The flags SURFACE's CSV cannot carry must survive here.

    Legacy parsed the flag and then discarded it, so a battery reading of 0.0
    was indistinguishable from a genuine zero. This is the only place the
    distinction is retained.
    """
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(batch(observation("BATTERY", "0.0", status="B")))
        row = store.readings()[0]

    assert row.status_tokens == ("B", "OK")


def test_store_is_idempotent_for_the_same_reading(tmp_path: Path) -> None:
    """Re-running a poll must not duplicate rows.

    A retry after a partial failure, or a replayed file, would otherwise
    inflate the record silently.
    """
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(batch(observation("AT", "29.5")))
        store.save(batch(observation("AT", "29.5")))

        assert len(store.readings()) == 1


def test_store_updates_a_corrected_value_rather_than_duplicating(
    tmp_path: Path,
) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(batch(observation("AT", "29.5")))
        store.save(batch(observation("AT", "29.7")))

        rows = store.readings()

    assert len(rows) == 1
    assert rows[0].value == Decimal("29.7")


def test_store_separates_readings_taken_at_different_times(tmp_path: Path) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        at_first = datetime(2026, 8, 15, 14, 0, tzinfo=UTC)
        at_second = datetime(2026, 8, 15, 14, 10, tzinfo=UTC)
        store.save(batch(observation("AT", "29.5"), at=at_first))
        store.save(batch(observation("AT", "29.7"), at=at_second))

        assert len(store.readings()) == 2


def test_store_returns_readings_newest_first(tmp_path: Path) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        at_first = datetime(2026, 8, 15, 14, 0, tzinfo=UTC)
        at_second = datetime(2026, 8, 15, 14, 10, tzinfo=UTC)
        store.save(batch(observation("AT", "29.5"), at=at_first))
        store.save(batch(observation("AT", "29.7"), at=at_second))

        rows = store.readings()

    assert rows[0].value == Decimal("29.7")


def test_store_can_limit_how_many_readings_it_returns(tmp_path: Path) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        for minute in (0, 10, 20):
            store.save(
                batch(
                    observation("AT", "29.5"),
                    at=datetime(2026, 8, 15, 14, minute, tzinfo=UTC),
                )
            )

        assert len(store.readings(limit=2)) == 2


def test_store_reports_how_many_readings_it_holds(tmp_path: Path) -> None:
    with ObservationStore(tmp_path / "obs.db") as store:
        store.save(observation_batch := batch(observation("AT", "29.5")))
        assert store.count() == len(observation_batch.observations)
