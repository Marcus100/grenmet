from datetime import UTC, datetime
from decimal import Decimal

import pytest

from sutron_collector.models import CollectedBatch, Observation
from sutron_collector.surface_export import (
    NEW_SURFACE_VARIABLES,
    SURFACE_NAME_MAX,
    SUTRON_TO_SURFACE,
    UnmappedTagsError,
    render_surface_csv,
    snap_to_minute,
    surface_filename,
)


def observation(tag: str, value: str) -> Observation:
    return Observation(
        tag=tag,
        value=Decimal(value),
        status_tokens=("G", "OK"),
        raw_line=f"{tag} {value} G OK",
    )


def batch(*observations: Observation, at: datetime | None = None) -> CollectedBatch:
    return CollectedBatch(
        station_name="MAURICEBISHOPINTL",
        station_id=13000,
        collected_at=at or datetime(2026, 8, 15, 14, 6, tzinfo=UTC),
        observations=observations,
    )


# --- the mapping -------------------------------------------------------------


def test_every_live_sutron_tag_has_a_surface_variable() -> None:
    """All 17 tags the station reported on 2026-08-15 must be mappable.

    Legacy silently dropped readings it had no column for. Failing this test is
    how we find out we are about to repeat that.
    """
    live_tags = {
        "WSA", "AT", "RAIN", "GUSTDIR", "BATTERY", "QNH", "RH", "WDI", "WSI",
        "DP", "QFE", "ATMIN", "BARO", "QFF", "ATMAX", "GUST", "WDA",
    }
    assert live_tags <= set(SUTRON_TO_SURFACE)


def test_pressure_tags_map_to_four_distinct_variables() -> None:
    """BARO/QFE/QFF/QNH are different quantities and must not be merged."""
    symbols = {SUTRON_TO_SURFACE[t] for t in ("BARO", "QFE", "QFF", "QNH")}
    assert len(symbols) == 4


def test_wind_average_and_instantaneous_stay_distinct() -> None:
    assert SUTRON_TO_SURFACE["WSA"] != SUTRON_TO_SURFACE["WSI"]
    assert SUTRON_TO_SURFACE["WDA"] != SUTRON_TO_SURFACE["WDI"]


def test_variables_needing_creation_are_declared() -> None:
    """Symbols absent from stock SURFACE must be listed for provisioning."""
    assert set(NEW_SURFACE_VARIABLES) == {
        SUTRON_TO_SURFACE["QFE"],
        SUTRON_TO_SURFACE["QFF"],
        SUTRON_TO_SURFACE["GUSTDIR"],
    }
    for spec in NEW_SURFACE_VARIABLES.values():
        assert spec.name
        assert spec.unit


# --- rendering ---------------------------------------------------------------


def test_render_surface_csv_uses_semicolons_and_a_datetime_column() -> None:
    """SURFACE's reader is pd.read_csv(sep=';', parse_dates=['datetime'])."""
    text = render_surface_csv([batch(observation("AT", "29.5"))])
    header, row = text.splitlines()

    assert header.startswith("datetime;")
    assert ";" in row
    assert "," not in row


def test_render_surface_csv_writes_symbols_not_sutron_tags() -> None:
    text = render_surface_csv([batch(observation("AT", "29.5"))])
    header = text.splitlines()[0]

    assert "TEMP" in header
    assert "AT;" not in header


def test_render_surface_csv_writes_timezone_aware_timestamps() -> None:
    """An explicit offset removes any dependence on station configuration.

    SURFACE only applies its own utc_offset when the timestamp is naive, so
    writing an aware value makes the reading unambiguous whatever the station
    record says.
    """
    text = render_surface_csv([batch(observation("AT", "29.5"))])
    row = text.splitlines()[1]

    assert row.startswith("2026-08-15T14:06:00+00:00")


def test_render_surface_csv_preserves_exact_decimal_values() -> None:
    """No float conversion: 78.1 must not become 78.09."""
    text = render_surface_csv([batch(observation("RH", "78.1"))])
    assert "78.1" in text
    assert "78.09" not in text


def test_render_surface_csv_writes_one_row_per_batch() -> None:
    batches = [
        batch(observation("AT", "29.5"), at=datetime(2026, 8, 15, 14, 0, tzinfo=UTC)),
        batch(observation("AT", "29.7"), at=datetime(2026, 8, 15, 14, 10, tzinfo=UTC)),
    ]
    lines = render_surface_csv(batches).splitlines()

    assert len(lines) == 3  # header plus two rows
    assert "29.5" in lines[1]
    assert "29.7" in lines[2]


def test_render_surface_csv_leaves_absent_readings_empty() -> None:
    """A sensor missing from one batch must not shift other columns.

    Every row carries every column; pandas reads a blank as NaN, and SURFACE
    drops those rows per variable rather than inserting a wrong value.
    """
    batches = [
        batch(
            observation("AT", "29.5"),
            observation("RH", "78.1"),
            at=datetime(2026, 8, 15, 14, 0, tzinfo=UTC),
        ),
        batch(observation("AT", "29.7"), at=datetime(2026, 8, 15, 14, 10, tzinfo=UTC)),
    ]
    header, first, second = render_surface_csv(batches).splitlines()

    assert header.count(";") == first.count(";") == second.count(";")
    assert second.endswith(";")


def test_render_surface_csv_rejects_unmapped_tags() -> None:
    """An unknown tag is reported, never silently dropped."""
    with pytest.raises(UnmappedTagsError, match="NEWSENSOR"):
        render_surface_csv([batch(observation("NEWSENSOR", "1.0"))])


def test_render_surface_csv_can_skip_unmapped_tags_when_asked() -> None:
    text = render_surface_csv(
        [batch(observation("AT", "29.5"), observation("NEWSENSOR", "1.0"))],
        skip_unmapped=True,
    )
    assert "TEMP" in text.splitlines()[0]
    assert "NEWSENSOR" not in text


# --- filenames ---------------------------------------------------------------


def test_surface_filename_embeds_the_station_code() -> None:
    """SURFACE parses the code out of the filename: file.split('_')[1]."""
    assert surface_filename("78958") == "surface_78958.csv"
    assert surface_filename("78958").split("_")[1].split(".")[0] == "78958"


def test_surface_filename_can_include_a_month_suffix() -> None:
    at = datetime(2026, 8, 15, 14, 6, tzinfo=UTC)
    assert surface_filename("78958", month=at) == "surface_78958_2026-08.csv"


def test_surface_filename_rejects_codes_containing_underscores() -> None:
    """An underscore would corrupt SURFACE's split-based code extraction."""
    with pytest.raises(ValueError, match="underscore"):
        surface_filename("789_58")


def test_snap_to_minute_drops_seconds_so_intervals_are_exact() -> None:
    """Consecutive polls must land an exact interval apart for SURFACE."""
    first = snap_to_minute(datetime(2026, 8, 15, 15, 5, 3, 557395, tzinfo=UTC))
    second = snap_to_minute(datetime(2026, 8, 15, 15, 15, 7, 112000, tzinfo=UTC))

    assert first == datetime(2026, 8, 15, 15, 5, tzinfo=UTC)
    assert (second - first).total_seconds() == 600


def test_snap_to_minute_is_unambiguous_at_the_five_minute_offset() -> None:
    """The collector polls at :05 to avoid legacy; that must survive snapping.

    Snapping to a ten-minute grid would put :05 exactly between two boundaries.
    """
    snapped = snap_to_minute(datetime(2026, 8, 15, 15, 5, 47, tzinfo=UTC))
    assert snapped.minute == 5


def test_rendered_rows_carry_snapped_timestamps() -> None:
    at = datetime(2026, 8, 15, 14, 6, 33, 999999, tzinfo=UTC)
    text = render_surface_csv([batch(observation("AT", "29.5"), at=at)])

    assert text.splitlines()[1].startswith("2026-08-15T14:06:00+00:00")


def test_surface_filename_is_unique_per_reading() -> None:
    """Every poll needs its own file or each reading overwrites the last."""
    first = surface_filename("78958", at=datetime(2026, 8, 15, 15, 5, tzinfo=UTC))
    second = surface_filename("78958", at=datetime(2026, 8, 15, 15, 15, tzinfo=UTC))

    assert first != second
    assert first == "surface_78958_20260815-1505.csv"


def test_timestamped_filename_still_yields_the_station_code() -> None:
    """SURFACE's split must still find the code with a timestamp appended."""
    name = surface_filename("78958", at=datetime(2026, 8, 15, 15, 5, tzinfo=UTC))
    assert name.split("_")[1] == "78958"


def test_new_variable_names_fit_surfaces_column() -> None:
    """SURFACE stores Variable.name as varchar(40) and rejects anything longer.

    Found the hard way: a 44-character name raised StringDataRightTruncation
    partway through provisioning, leaving one variable created and two not.
    """
    for spec in NEW_SURFACE_VARIABLES.values():
        assert len(spec.name) <= SURFACE_NAME_MAX, spec.symbol
